/**
 * Just enough of the JVM class-file format to read a submission's methods and the calls they make.
 *
 * The harness's eligibility check (worker/jvm-harness-eligibility.ts) parses every class file
 * javac produced, so a build directory holding anything that is not a well-formed class file is
 * declined rather than handed to the harness. It used to answer a second question as well — can
 * this submission recurse? — and decline those too, because a JVM that had already run tests
 * overflowed earlier than a fresh one. The harness now runs every test's main on a thread whose
 * stack is eight times the JVM's default, measured deeper than a fresh JVM for every shape tried,
 * so that analysis and its decline are gone.
 */

const ACC_ABSTRACT = 0x0400;
const ACC_NATIVE = 0x0100;

type Constant =
  | { readonly tag: "utf8"; readonly value: string }
  | { readonly tag: "class"; readonly name: number }
  | { readonly tag: "ref"; readonly kind: number; readonly owner: number; readonly nameAndType: number }
  | { readonly tag: "nameAndType"; readonly name: number; readonly descriptor: number }
  | { readonly tag: "methodHandle"; readonly reference: number }
  | { readonly tag: "indy"; readonly bootstrap: number; readonly nameAndType: number }
  | { readonly tag: "other" };

export interface MethodRef {
  readonly owner: string;
  readonly name: string;
  readonly descriptor: string;
  /** invokeinterface, or invokevirtual — a call that dispatches. */
  readonly dispatches: boolean;
}

export interface ParsedMethod {
  readonly owner: string;
  readonly name: string;
  readonly descriptor: string;
  readonly hasCode: boolean;
  readonly calls: readonly MethodRef[];
  /** Methods named by the lambda / method-reference call sites in this method. */
  readonly creates: readonly MethodRef[];
  /**
   * Descriptors of the method's invokedynamic sites: a lambda or method reference, a string
   * concatenation (whose operands are its parameters), a record's generated toString/hashCode.
   */
  readonly indyDescriptors: readonly string[];
}

export interface ParsedClass {
  readonly name: string;
  /** The superclass (absent only for java/lang/Object) and every directly implemented interface. */
  readonly supertypes: readonly string[];
  readonly methods: readonly ParsedMethod[];
}

export class ClassFormatError extends Error {}

class Reader {
  private at = 0;
  constructor(private readonly bytes: Buffer) {}
  u1(): number {
    this.need(1);
    return this.bytes.readUInt8(this.at++);
  }
  u2(): number {
    this.need(2);
    const v = this.bytes.readUInt16BE(this.at);
    this.at += 2;
    return v;
  }
  u4(): number {
    this.need(4);
    const v = this.bytes.readUInt32BE(this.at);
    this.at += 4;
    return v;
  }
  take(n: number): Buffer {
    this.need(n);
    const out = this.bytes.subarray(this.at, this.at + n);
    this.at += n;
    return out;
  }
  private need(n: number): void {
    if (this.at + n > this.bytes.length) throw new ClassFormatError("truncated class file");
  }
}

function readConstants(r: Reader): Constant[] {
  const count = r.u2();
  const pool: Constant[] = [{ tag: "other" }];
  for (let i = 1; i < count; i += 1) {
    const tag = r.u1();
    switch (tag) {
      case 1:
        pool.push({ tag: "utf8", value: r.take(r.u2()).toString("latin1") });
        break;
      case 7:
        pool.push({ tag: "class", name: r.u2() });
        break;
      case 8:
      case 16:
      case 19:
      case 20:
        r.u2();
        pool.push({ tag: "other" });
        break;
      case 3:
      case 4:
        r.u4();
        pool.push({ tag: "other" });
        break;
      case 5:
      case 6:
        r.u4();
        r.u4();
        pool.push({ tag: "other" }, { tag: "other" });
        i += 1;
        break;
      case 9:
      case 10:
      case 11:
        pool.push({ tag: "ref", kind: tag, owner: r.u2(), nameAndType: r.u2() });
        break;
      case 12:
        pool.push({ tag: "nameAndType", name: r.u2(), descriptor: r.u2() });
        break;
      case 15:
        r.u1();
        pool.push({ tag: "methodHandle", reference: r.u2() });
        break;
      case 17:
        r.u2();
        r.u2();
        pool.push({ tag: "other" });
        break;
      case 18: {
        const bootstrap = r.u2();
        pool.push({ tag: "indy", bootstrap, nameAndType: r.u2() });
        break;
      }
      default:
        throw new ClassFormatError(`unknown constant tag ${String(tag)}`);
    }
  }
  return pool;
}

function utf8(pool: readonly Constant[], index: number): string {
  const c = pool[index];
  if (c?.tag !== "utf8") throw new ClassFormatError(`constant ${String(index)} is not Utf8`);
  return c.value;
}

function className(pool: readonly Constant[], index: number): string {
  const c = pool[index];
  if (c?.tag !== "class") throw new ClassFormatError(`constant ${String(index)} is not a Class`);
  return utf8(pool, c.name);
}

function methodRef(pool: readonly Constant[], index: number, dispatches: boolean): MethodRef | null {
  const c = pool[index];
  if (c?.tag !== "ref" || c.kind === 9) return null;
  const nt = pool[c.nameAndType];
  if (nt?.tag !== "nameAndType") return null;
  return {
    owner: className(pool, c.owner),
    name: utf8(pool, nt.name),
    descriptor: utf8(pool, nt.descriptor),
    dispatches,
  };
}

/** One entry of the BootstrapMethods attribute: the bootstrap handle and its static arguments. */
interface Bootstrap {
  readonly handle: number;
  readonly args: readonly number[];
}

/** An invokedynamic site: which bootstrap it links through, and its call descriptor. */
interface IndySite {
  readonly bootstrap: number;
  readonly descriptor: string;
}

function handleRef(pool: readonly Constant[], index: number): MethodRef | null {
  const c = pool[index];
  return c?.tag === "methodHandle" ? methodRef(pool, c.reference, false) : null;
}

/**
 * The method a lambda or method-reference site will run: LambdaMetafactory's second static
 * argument is the implementation handle (JVMS, java.lang.invoke.LambdaMetafactory). Any other
 * bootstrap — string concatenation, a record's ObjectMethods, a pattern switch — creates no
 * callable the program can recurse through.
 */
function lambdaTarget(pool: readonly Constant[], bootstraps: readonly Bootstrap[], site: IndySite): MethodRef | null {
  const bsm = bootstraps[site.bootstrap];
  if (bsm === undefined) return null;
  const factory = handleRef(pool, bsm.handle);
  if (factory?.owner !== "java/lang/invoke/LambdaMetafactory") return null;
  const impl = bsm.args[1];
  return impl === undefined ? null : handleRef(pool, impl);
}

function readBootstraps(body: Buffer): Bootstrap[] {
  const r = new Reader(body);
  const count = r.u2();
  const out: Bootstrap[] = [];
  for (let i = 0; i < count; i += 1) {
    const handle = r.u2();
    const argCount = r.u2();
    const args: number[] = [];
    for (let a = 0; a < argCount; a += 1) args.push(r.u2());
    out.push({ handle, args });
  }
  return out;
}

/** Length of the instruction at `pc`, per JVMS §6.5. */
function instructionLength(code: Buffer, pc: number): number {
  const op = code[pc] ?? 0;
  if (op === 0xaa) {
    const base = pc + 1 + ((4 - ((pc + 1) % 4)) % 4);
    const low = code.readInt32BE(base + 4);
    const high = code.readInt32BE(base + 8);
    return base - pc + 12 + (high - low + 1) * 4;
  }
  if (op === 0xab) {
    const base = pc + 1 + ((4 - ((pc + 1) % 4)) % 4);
    const pairs = code.readInt32BE(base + 4);
    return base - pc + 8 + pairs * 8;
  }
  if (op === 0xc4) return code[pc + 1] === 0x84 ? 6 : 4;
  const len = OPCODE_LENGTHS[op];
  if (len === undefined || len === 0) throw new ClassFormatError(`bad opcode ${String(op)}`);
  return len;
}

/* Lengths (opcode byte included) of every fixed-length JVM instruction. */
const OPCODE_LENGTHS: readonly number[] = (() => {
  const t = new Array<number>(256).fill(0);
  for (let op = 0x00; op <= 0xc9; op += 1) t[op] = 1;
  for (const op of [0x10, 0x12, 0x15, 0x16, 0x17, 0x18, 0x19, 0x36, 0x37, 0x38, 0x39, 0x3a, 0xa9, 0xbc])
    t[op] = 2;
  for (const op of [0x11, 0x13, 0x14, 0x84, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xbb, 0xbd, 0xc0, 0xc1, 0xc6, 0xc7])
    t[op] = 3;
  for (let op = 0x99; op <= 0xa8; op += 1) t[op] = 3;
  t[0xc5] = 4;
  for (const op of [0xb9, 0xba, 0xc8, 0xc9]) t[op] = 5;
  return t;
})();

function scanCode(code: Buffer, pool: readonly Constant[]) {
  const calls: MethodRef[] = [];
  const sites: IndySite[] = [];
  for (let pc = 0; pc < code.length; pc += instructionLength(code, pc)) {
    const op = code[pc];
    if (op === 0xb6 || op === 0xb7 || op === 0xb8 || op === 0xb9) {
      const ref = methodRef(pool, code.readUInt16BE(pc + 1), op === 0xb6 || op === 0xb9);
      if (ref !== null) calls.push(ref);
    } else if (op === 0xba) {
      const site = pool[code.readUInt16BE(pc + 1)];
      if (site?.tag !== "indy") throw new ClassFormatError("invokedynamic without a call site");
      const nt = pool[site.nameAndType];
      if (nt?.tag !== "nameAndType") throw new ClassFormatError("call site without a type");
      sites.push({ bootstrap: site.bootstrap, descriptor: utf8(pool, nt.descriptor) });
    }
  }
  return { calls, sites };
}

export function parseClass(bytes: Buffer): ParsedClass {
  const r = new Reader(bytes);
  if (r.u4() !== 0xcafebabe) throw new ClassFormatError("not a class file");
  r.u2();
  r.u2();
  const pool = readConstants(r);
  r.u2();
  const self = className(pool, r.u2());
  const superIndex = r.u2();
  const supertypes: string[] = superIndex === 0 ? [] : [className(pool, superIndex)];
  const interfaces = r.u2();
  for (let i = 0; i < interfaces; i += 1) supertypes.push(className(pool, r.u2()));
  const skipMembers = (): void => {
    const count = r.u2();
    for (let i = 0; i < count; i += 1) {
      r.u2();
      r.u2();
      r.u2();
      const attrs = r.u2();
      for (let a = 0; a < attrs; a += 1) {
        r.u2();
        r.take(r.u4());
      }
    }
  };
  skipMembers();

  const raw: { access: number; name: string; descriptor: string; hasCode: boolean; calls: MethodRef[]; sites: IndySite[] }[] = [];
  const methodCount = r.u2();
  for (let m = 0; m < methodCount; m += 1) {
    const access = r.u2();
    const name = utf8(pool, r.u2());
    const descriptor = utf8(pool, r.u2());
    let scanned: { calls: MethodRef[]; sites: IndySite[] } = { calls: [], sites: [] };
    let hasCode = false;
    const attrs = r.u2();
    for (let a = 0; a < attrs; a += 1) {
      const attrName = utf8(pool, r.u2());
      const body = r.take(r.u4());
      if (attrName === "Code" && (access & (ACC_ABSTRACT | ACC_NATIVE)) === 0) {
        hasCode = true;
        const codeLength = body.readUInt32BE(4);
        scanned = scanCode(body.subarray(8, 8 + codeLength), pool);
      }
    }
    raw.push({ access, name, descriptor, hasCode, ...scanned });
  }

  // Class attributes follow the methods; BootstrapMethods says what each invokedynamic links to.
  let bootstraps: Bootstrap[] = [];
  const classAttrs = r.u2();
  for (let a = 0; a < classAttrs; a += 1) {
    const attrName = utf8(pool, r.u2());
    const body = r.take(r.u4());
    if (attrName === "BootstrapMethods") bootstraps = readBootstraps(body);
  }

  const methods: ParsedMethod[] = raw.map((m) => ({
    owner: self,
    name: m.name,
    descriptor: m.descriptor,
    hasCode: m.hasCode,
    calls: m.calls,
    creates: m.sites.flatMap((site) => {
      const target = lambdaTarget(pool, bootstraps, site);
      return target === null ? [] : [target];
    }),
    indyDescriptors: m.sites.map((site) => site.descriptor),
  }));
  return { name: self, supertypes, methods };
}
