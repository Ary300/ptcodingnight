(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,195328,e=>{"use strict";var t=e.i(843476),n=e.i(500932),r=e.i(271645),i=e.i(771120);let a=`${i.CONTROL_SURFACE} ${i.CONTROL_PAD.md} ${i.CONTROL_LEADING.md} placeholder:text-ink/60`;function l(e){return e?"border-panther":"border-rule-edge focus:border-ink"}function s({label:e,hint:n,error:i,required:a=!1,wide:l=!1,children:o}){let c=(0,r.useId)(),d=`${c}-control`,u=`${c}-label`,m=`${c}-hint`,p=`${c}-error`,h="string"==typeof i&&i.length>0,f=[void 0!==n?m:null,h?p:null].filter(e=>null!==e).join(" ")||void 0;return(0,t.jsx)("div",{className:"@container",children:(0,t.jsxs)("div",{className:"grid grid-cols-1 gap-tight @xl:grid-cols-[12rem_minmax(0,1fr)] @xl:gap-x-group",children:[(0,t.jsxs)("label",{id:u,htmlFor:d,className:"font-semibold @xl:pt-2.5",style:{fontSize:"var(--text-sm)"},children:[e,a&&(0,t.jsx)("span",{className:"text-panther","aria-hidden":"true",children:" *"}),a&&(0,t.jsx)("span",{className:"sr-only",children:" (required)"})]}),(0,t.jsxs)("div",{className:`flex min-w-0 flex-col gap-tight ${l?"":"@xl:max-w-md"}`,children:[o({controlId:d,labelId:u,describedBy:f,invalid:h}),void 0!==n&&(0,t.jsx)("p",{id:m,className:"max-w-[70ch] text-ink/60",style:{fontSize:"var(--text-xs)"},children:n}),h&&(0,t.jsx)("p",{id:p,role:"alert",className:"motion-swap-in font-semibold text-panther",style:{fontSize:"var(--text-xs)"},children:i})]})]})})}e.s(["Field",0,s,"Select",0,function(e){let r,a,l,o,c,d,u,m,p=(0,n.c)(17);return p[0]!==e?({label:o,hint:l,error:a,required:c,children:r,...d}=e,p[0]=e,p[1]=r,p[2]=a,p[3]=l,p[4]=o,p[5]=c,p[6]=d):(r=p[1],a=p[2],l=p[3],o=p[4],c=p[5],d=p[6]),p[7]!==r||p[8]!==c||p[9]!==d?(u=e=>{let{controlId:n,labelId:a,describedBy:l,invalid:s}=e;return(0,t.jsx)(i.Select,{...d,id:n,required:c,invalid:s,"aria-labelledby":void 0===d["aria-label"]?d["aria-labelledby"]??a:void 0,"aria-describedby":l,children:r})},p[7]=r,p[8]=c,p[9]=d,p[10]=u):u=p[10],p[11]!==a||p[12]!==l||p[13]!==o||p[14]!==c||p[15]!==u?(m=(0,t.jsx)(s,{label:o,hint:l,error:a,required:c,children:u}),p[11]=a,p[12]=l,p[13]=o,p[14]=c,p[15]=u,p[16]=m):m=p[16],m},"TextArea",0,function(e){let r,i,o,c,d,u,m,p,h=(0,n.c)(17);h[0]!==e?({label:o,hint:i,error:r,mono:u,required:c,...d}=e,h[0]=e,h[1]=r,h[2]=i,h[3]=o,h[4]=c,h[5]=d,h[6]=u):(r=h[1],i=h[2],o=h[3],c=h[4],d=h[5],u=h[6]);let f=void 0!==u&&u;return h[7]!==f||h[8]!==c||h[9]!==d?(m=e=>{let{controlId:n,describedBy:r,invalid:i}=e;return(0,t.jsx)("textarea",{...d,id:n,required:c,"aria-invalid":i||void 0,"aria-describedby":r,className:`${a} ${l(i)} ${f?"numeric":""}`})},h[7]=f,h[8]=c,h[9]=d,h[10]=m):m=h[10],h[11]!==r||h[12]!==i||h[13]!==o||h[14]!==c||h[15]!==m?(p=(0,t.jsx)(s,{label:o,hint:i,error:r,required:c,wide:!0,children:m}),h[11]=r,h[12]=i,h[13]=o,h[14]=c,h[15]=m,h[16]=p):p=h[16],p},"TextInput",0,function(e){let r,i,o,c,d,u,m,p,h=(0,n.c)(17);h[0]!==e?({label:o,hint:i,error:r,numeric:u,required:c,...d}=e,h[0]=e,h[1]=r,h[2]=i,h[3]=o,h[4]=c,h[5]=d,h[6]=u):(r=h[1],i=h[2],o=h[3],c=h[4],d=h[5],u=h[6]);let f=void 0!==u&&u;return h[7]!==f||h[8]!==c||h[9]!==d?(m=e=>{let{controlId:n,describedBy:r,invalid:i}=e;return(0,t.jsx)("input",{...d,id:n,required:c,"aria-invalid":i||void 0,"aria-describedby":r,className:`${a} ${l(i)} ${f?"numeric":""}`})},h[7]=f,h[8]=c,h[9]=d,h[10]=m):m=h[10],h[11]!==r||h[12]!==i||h[13]!==o||h[14]!==c||h[15]!==m?(p=(0,t.jsx)(s,{label:o,hint:i,error:r,required:c,children:m}),h[11]=r,h[12]=i,h[13]=o,h[14]=c,h[15]=m,h[16]=p):p=h[16],p}])},918636,e=>{"use strict";let t="-XX:MaxRAMPercentage=75 -XX:-UsePerfData -XX:Tier4InvocationThreshold=50000 -XX:Tier4MinInvocationThreshold=6000 -XX:Tier4CompileThreshold=150000 -XX:Tier4BackEdgeThreshold=400000",n="-J-XX:TieredStopAtLevel=1 -J-XX:+UseSerialGC -J-XX:-UsePerfData",r=`exec java ${t} -Djava.security.manager=allow --add-opens java.base/java.lang=ptcn.harness -p /opt/ptcn/harness.jar -m ptcn.harness/ptcn.harness.Harness /build Main "$PTCN_TIMEOUT" /in /tmp/ptcn-raw /tmp/ptcn-err`,i={file:"Main.class",declarationKeyword:"package",nestedMessage:'Delete the line "package {package};" at the top of your file. The judge runs public class Main with no package, so with that line it cannot find your program.'},a={PYTHON_312:{id:"PYTHON_312",runtime:"python312",label:"Python 3",sourceFile:"main.py",compileCommand:"python -c \"compile(open('/work/main.py').read(), 'main.py', 'exec')\"",producesArtifacts:!1,runCommand:"exec python -I /work/main.py",starter:`import sys


def main():
    data = sys.stdin.read().split()
    pos = 0

    # Read the input in the order the problem describes it, for example:
    #   n = int(data[pos]); pos += 1
    #   values = [int(x) for x in data[pos:pos + n]]; pos += n
    #
    # Then print the answer:
    #   print(answer)


main()
`},JAVA_8:{id:"JAVA_8",runtime:"jdk21",label:"Java 8",sourceFile:"Main.java",compileCommand:`javac ${n} --release 8 -proc:none -nowarn -d /build /work/Main.java`,producesArtifacts:!0,runCommand:`exec java ${t} -cp /build Main`,entryArtifact:i,starter:`import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        // your code here
    }
}
`},JAVA_11:{id:"JAVA_11",runtime:"jdk21",label:"Java 11",sourceFile:"Main.java",compileCommand:`javac ${n} --release 11 -proc:none -nowarn -d /build /work/Main.java`,producesArtifacts:!0,runCommand:`exec java ${t} -cp /build Main`,entryArtifact:i,starter:`import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        // your code here
    }
}
`},JAVA_17:{id:"JAVA_17",runtime:"jdk21",label:"Java 17",sourceFile:"Main.java",compileCommand:`javac ${n} --release 17 -proc:none -nowarn -d /build /work/Main.java`,producesArtifacts:!0,runCommand:`exec java ${t} -cp /build Main`,entryArtifact:i,starter:`import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        // your code here
    }
}
`},JAVA_21:{id:"JAVA_21",runtime:"jdk21",label:"Java 21",sourceFile:"Main.java",compileCommand:`javac ${n} --release 21 -proc:none -nowarn -d /build /work/Main.java`,producesArtifacts:!0,runCommand:`exec java ${t} -cp /build Main`,entryArtifact:i,harnessCommand:r,compileService:"javac",starter:`import java.util.*;
import java.io.*;

public class Main {
    static BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    static StringTokenizer tokens = new StringTokenizer("");

    // The next word of the input, reading across line breaks.
    static String next() throws IOException {
        while (!tokens.hasMoreTokens()) {
            String line = in.readLine();
            if (line == null) return null;
            tokens = new StringTokenizer(line);
        }
        return tokens.nextToken();
    }

    static int nextInt() throws IOException {
        return Integer.parseInt(next());
    }

    static long nextLong() throws IOException {
        return Long.parseLong(next());
    }

    public static void main(String[] args) throws IOException {
        PrintWriter out = new PrintWriter(new BufferedWriter(new OutputStreamWriter(System.out)));

        // Read the input in the order the problem describes it, for example:
        //   int n = nextInt();
        //   int[] a = new int[n];
        //   for (int i = 0; i < n; i++) a[i] = nextInt();
        //
        // Then print the answer:
        //   out.println(answer);

        out.flush();
    }
}
`},C_17:{id:"C_17",runtime:"gcc14",label:"C",sourceFile:"main.c",compileCommand:"gcc -std=c17 -O2 -o /build/prog /work/main.c -lm",producesArtifacts:!0,runCommand:"exec /build/prog",starter:`#include <stdio.h>

int main(void) {
    /* your code here */
    return 0;
}
`},CPP_11:{id:"CPP_11",runtime:"gcc14",label:"C++11",sourceFile:"main.cpp",compileCommand:"g++ -std=c++11 -O2 -Werror=c++14-extensions -Werror=c++17-extensions -Werror=c++20-extensions -Werror=c++23-extensions -Werror=c++26-extensions -o /build/prog /work/main.cpp",producesArtifacts:!0,runCommand:"exec /build/prog",starter:`#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    // your code here
    return 0;
}
`},CPP_17:{id:"CPP_17",runtime:"gcc14",label:"C++17",sourceFile:"main.cpp",compileCommand:"g++ -std=c++17 -O2 -Werror=c++20-extensions -Werror=c++23-extensions -Werror=c++26-extensions -o /build/prog /work/main.cpp",producesArtifacts:!0,runCommand:"exec /build/prog",starter:`#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    // Read the input in the order the problem describes it, for example:
    //   int n;
    //   cin >> n;
    //   vector<long long> a(n);
    //   for (auto &x : a) cin >> x;
    //
    // Then print the answer:
    //   cout << answer << '\\n';

    return 0;
}
`},JAVASCRIPT_NODE22:{id:"JAVASCRIPT_NODE22",runtime:"node22",label:"JavaScript (Node.js)",sourceFile:"main.js",compileCommand:"node --check /work/main.js",producesArtifacts:!1,runCommand:"exec node /work/main.js",starter:`const data = require("node:fs").readFileSync(0, "utf8").split(/\\s+/);

function main() {
  // your code here
}

main();
`},GO_123:{id:"GO_123",runtime:"go123",label:"Go",sourceFile:"main.go",compileCommand:"GOCACHE=/opt/gocache GOTMPDIR=/tmp GOPATH=/tmp/gopath GOMAXPROCS=4 go build -o /build/prog /work/main.go",producesArtifacts:!0,runCommand:"exec env GOMAXPROCS=2 /build/prog",starter:`package main

import (
	"bufio"
	"fmt"
	"os"
)

func main() {
	reader := bufio.NewReader(os.Stdin)
	writer := bufio.NewWriter(os.Stdout)
	defer writer.Flush()
	_ = reader
	_ = fmt.Sprint
	// your code here
}
`}};e.s(["CONTEST_LANGUAGES",0,["PYTHON_312","JAVA_21","CPP_17"],"LANGUAGE_IDS",0,["PYTHON_312","JAVA_8","JAVA_11","JAVA_17","JAVA_21","C_17","CPP_11","CPP_17","JAVASCRIPT_NODE22","GO_123"],"VARIANTS",0,a])},838873,640910,e=>{"use strict";var t=e.i(843476),n=e.i(500932),r=e.i(271645);function i(e){let r,i,a,l,s=(0,n.c)(11),{summary:o,defaultOpen:c,children:d,className:u,kind:m}=e,p=!!(void 0!==c&&c)||void 0,h=`group rounded-panel border border-rule-edge bg-paper ${u??""}`;return s[0]===Symbol.for("react.memo_cache_sentinel")?(r=(0,t.jsx)("svg",{"aria-hidden":"true",width:"12",height:"12",viewBox:"0 0 12 12",className:"shrink-0 text-panther transition-transform duration-[var(--motion-press)] group-open:rotate-90 motion-reduce:transition-none",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:(0,t.jsx)("path",{d:"M4 2l4 4-4 4"})}),s[0]=r):r=s[0],s[1]!==o?(i=(0,t.jsxs)("summary",{className:"flex cursor-pointer list-none items-center gap-2.5 rounded-panel px-3 py-2.5 transition-colors duration-[var(--motion-press)] hover:bg-ink/[0.04] motion-reduce:transition-none [&::-webkit-details-marker]:hidden",children:[r,o]}),s[1]=o,s[2]=i):i=s[2],s[3]!==d?(a=(0,t.jsx)("div",{className:"border-t border-rule-hair px-3 pt-3 pb-3",children:d}),s[3]=d,s[4]=a):a=s[4],s[5]!==m||s[6]!==p||s[7]!==h||s[8]!==i||s[9]!==a?(l=(0,t.jsxs)("details",{"data-disclosure":m,open:p,className:h,children:[i,a]}),s[5]=m,s[6]=p,s[7]=h,s[8]=i,s[9]=a,s[10]=l):l=s[10],l}e.s(["Disclosure",0,i],640910);let a=[{re:/`([^`\n]+)`/,build:e=>({kind:"code",value:e[1]??""})},{re:/\$([^$\n]+)\$/,build:e=>({kind:"math",tex:e[1]??""})},{re:/\[([^\]\n]*)\]\(([^)\s]+)\)/,build:e=>{let t,n=(t=(e[2]??"").trim(),/^https?:\/\//i.test(t)||/^mailto:[^\s]+@[^\s]+$/i.test(t)||t.startsWith("/")||t.startsWith("#")?t:null);return null===n?{kind:"text",value:e[0]}:{kind:"link",href:n,children:l(e[1]??"")}}},{re:/\*\*([^*\n]+)\*\*/,build:e=>({kind:"strong",children:l(e[1]??"")})},{re:/__([^_\n]+)__/,build:e=>({kind:"strong",children:l(e[1]??"")})},{re:/\*([^*\n]+)\*/,build:e=>({kind:"em",children:l(e[1]??"")})},{re:/(?:^|\b)_([^_\n]+)_(?:\b|$)/,build:e=>({kind:"em",children:l(e[1]??"")})}];function l(e){let t=[],n=e;for(;n.length>0;){let e=1/0,r=null,i=null;for(let t of a){let a=t.re.exec(n);null!==a&&a.index<e&&(e=a.index,r=a,i=t)}if(null===r||null===i){t.push({kind:"text",value:n});break}e>0&&t.push({kind:"text",value:n.slice(0,e)}),t.push(i.build(r)),n=n.slice(e+r[0].length)}return t}let s=/^```(\w*)\s*$/,o=/^\$\$\s*$/,c=/^(#{1,6})\s+(.*)$/,d=/^(?:-{3,}|\*{3,}|_{3,})\s*$/,u=/^\s*[-*+]\s+(.*)$/,m=/^\s*\d+[.)]\s+(.*)$/,p=/^\s*>\s?(.*)$/,h=/^\s*$/;function f(e){return e.map(e=>{switch(e.kind){case"text":case"code":return e.value;case"math":return e.tex;case"strong":case"em":case"link":return f(e.children)}}).join("")}let x=/^examples?\b/i;function g(e){if("heading"===e.kind)return x.test(f(e.children).trim());if("paragraph"!==e.kind||1!==e.children.length)return!1;let t=e.children[0];return t?.kind==="strong"&&x.test(f(t.children).trim())}function b(e,t){return"heading"===e.kind?e.level:t(e)?7:null}let v={"\\le":"<=","\\leq":"<=","\\ge":">=","\\geq":">=","\\ne":"!=","\\neq":"!=","\\lt":"<","\\gt":">","\\times":"×","\\cdot":"×","\\pm":"±","\\div":"÷","\\ldots":"...","\\cdots":"...","\\dots":"...","\\in":" in ","\\bmod":" mod ","\\bigl":"","\\bigr":"","\\left":"","\\right":"","\\lfloor":"floor(","\\rfloor":")","\\lceil":"ceil(","\\rceil":")","\\{":"{","\\}":"}","\\%":"%","\\$":"$","\\_":"_","\\&":"&","\\#":"#","\\,":" ","\\;":" ","\\:":" ","\\!":"","\\ ":" ","\\quad":"  ","\\qquad":"    "},k=Object.keys(v).sort((e,t)=>t.length-e.length);function j(e){let r,i,a,l=(0,n.c)(10),{tex:s,display:o}=e;l[0]!==s?(r=function e(n,r="t"){let i=[],a="",l=0,s=0,o=()=>{a.length>0&&(i.push(a),a="")};for(;l<n.length;){let c=n[l]??"";if("^"===c||"_"===c){let{body:a,next:d}=function(e,t){if("{"===e[t]){let n=1,r=t+1;for(;r<e.length&&n>0;){let t=e[r];"{"===t?n+=1:"}"===t&&(n-=1),n>0&&(r+=1)}return{body:e.slice(t+1,r),next:r+1}}return{body:e[t]??"",next:t+1}}(n,l+1);o(),s+=1,i.push("^"===c?(0,t.jsx)("sup",{children:e(a,`${r}-${s}`)},`${r}-${s}`):(0,t.jsx)("sub",{children:e(a,`${r}-${s}`)},`${r}-${s}`)),l=d;continue}if("\\"===c){let e=k.find(e=>n.startsWith(e,l));if(void 0!==e){a+=v[e]??"",l+=e.length;continue}l+=1;continue}if("{"===c||"}"===c){l+=1;continue}a+=c,l+=1}return o(),i}(s),l[0]=s,l[1]=r):r=l[1];let c=r;if(void 0!==o&&o){let e,n;return l[2]===Symbol.for("react.memo_cache_sentinel")?(e={fontSize:"var(--text-md)"},l[2]=e):e=l[2],l[3]!==c||l[4]!==s?(n=(0,t.jsx)("div",{className:"numeric my-4 overflow-x-auto text-center",role:"math","aria-label":s,style:e,children:c}),l[3]=c,l[4]=s,l[5]=n):n=l[5],n}return l[6]===Symbol.for("react.memo_cache_sentinel")?(i={whiteSpace:"nowrap"},l[6]=i):i=l[6],l[7]!==c||l[8]!==s?(a=(0,t.jsx)("span",{className:"numeric",role:"math","aria-label":s,style:i,children:c}),l[7]=c,l[8]=s,l[9]=a):a=l[9],a}function y(e,n){return e.map((e,r)=>{let i=`${n}-${r}`;switch(e.kind){case"text":return(0,t.jsx)("span",{children:e.value},i);case"code":return(0,t.jsx)("code",{className:"rounded-chip bg-ink/10 px-1.5 py-0.5 font-mono text-[0.9em] text-ink",children:e.value},i);case"math":return(0,t.jsx)(j,{tex:e.tex},i);case"strong":return(0,t.jsx)("strong",{className:"font-semibold",children:y(e.children,i)},i);case"em":return(0,t.jsx)("em",{children:y(e.children,i)},i);case"link":return(0,t.jsx)("a",{href:e.href,className:"text-panther underline underline-offset-2 transition-colors duration-[var(--motion-press)] hover:text-panther-deep",rel:"noopener noreferrer",children:y(e.children,i)},i)}})}function w(e,n){switch(e.kind){case"heading":return(0,r.createElement)(`h${e.level}`,{key:n,className:"mt-8 mb-3 font-display font-bold text-ink first:mt-0",style:{fontSize:e.level<=3?"var(--text-md)":"var(--text-sm)"}},y(e.children,n));case"paragraph":return(0,t.jsx)("p",{className:"my-4 leading-relaxed",children:y(e.children,n)},n);case"code":return(0,t.jsx)("pre",{className:"my-5 overflow-x-auto rounded-flat bg-ink/[0.04] p-4 text-ink",tabIndex:0,role:"region","aria-label":null===e.language?"Code block":`${e.language} code block`,children:(0,t.jsx)("code",{className:"font-mono text-xs leading-relaxed",children:e.value})},n);case"mathBlock":return(0,t.jsx)(j,{tex:e.tex,display:!0},n);case"list":{let r=e.items.map((e,r)=>(0,t.jsx)("li",{className:"my-1.5",children:y(e,`${n}-${r}`)},`${n}-${r}`));return e.ordered?(0,t.jsx)("ol",{className:"my-4 list-decimal space-y-1 pl-6",children:r},n):(0,t.jsx)("ul",{className:"my-4 list-disc space-y-1 pl-6",children:r},n)}case"quote":return(0,t.jsx)("blockquote",{className:"my-5 border-l-4 border-panther/50 bg-ink/5 py-2 pl-4 text-ink/80",children:y(e.children,n)},n);case"rule":return(0,t.jsx)("hr",{className:"my-8 border-rule-edge"},n)}}function _(e,n){var a;return"section"===e.kind?(a=`s-${n}`,(0,t.jsx)(i,{kind:"statement-example",className:"my-3",summary:(0,r.createElement)(`h${e.level}`,{className:"font-display font-bold text-ink",style:{fontSize:e.level<=3?"var(--text-md)":"var(--text-sm)"}},y(e.title,`${a}-h`)),children:(0,t.jsx)("div",{className:"[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",children:e.body.map((e,t)=>w(e,`${a}-${t}`))})},a)):w(e,`b-${n}`)}e.s(["Markdown",0,function(e){let r,i=(0,n.c)(5),{source:a,className:f,collapseExamples:x}=e,v=void 0!==x&&x;if(i[0]!==f||i[1]!==v||i[2]!==a){let e,n=function(e){let t=e.replace(/\r\n?/g,"\n").split("\n"),n=[],r=0;for(;r<t.length;){var i;let e=t[r]??"",a=s.exec(e);if(null!==a){let e=(a[1]??"").length>0?a[1]??null:null,i=[];for(r+=1;r<t.length&&!s.test(t[r]??"");)i.push(t[r]??""),r+=1;r+=1,n.push({kind:"code",language:e,value:i.join("\n")});continue}if(o.test(e)){let e=[];for(r+=1;r<t.length&&!o.test(t[r]??"");)e.push(t[r]??""),r+=1;r+=1,n.push({kind:"mathBlock",tex:e.join(" ").trim()});continue}if(h.test(e)){r+=1;continue}if(d.test(e)){n.push({kind:"rule"}),r+=1;continue}let f=c.exec(e);if(null!==f){n.push({kind:"heading",level:function(e){let t=Math.min(6,e+1);return 2===t||3===t||4===t||5===t||6===t?t:6}((f[1]??"#").length),children:l(f[2]??"")}),r+=1;continue}if(u.test(e)||m.test(e)){let i=m.test(e)&&!u.test(e),a=i?m:u,s=[];for(;r<t.length;){let e=a.exec(t[r]??"");if(null===e)break;s.push(l(e[1]??"")),r+=1}n.push({kind:"list",ordered:i,items:s});continue}if(p.test(e)){let e=[];for(;r<t.length;){let n=p.exec(t[r]??"");if(null===n)break;e.push(n[1]??""),r+=1}n.push({kind:"quote",children:l(e.join(" ").trim())});continue}let x=[];for(;r<t.length&&(i=t[r]??"",!(s.test(i)||o.test(i)||c.test(i)||d.test(i)||u.test(i)||m.test(i)||p.test(i)||h.test(i)));)x.push(t[r]??""),r+=1;n.push({kind:"paragraph",children:l(x.join(" ").trim())})}return n}(a),x=v?function(e,t){let n=[],r=1,i=0;for(;i<e.length;){let a=e[i];if(void 0===a)break;let l=b(a,t);if(null===l||!t(a)){"heading"===a.kind&&(r=a.level),n.push(a),i+=1;continue}let s=function(e,t,n,r){let i=t+1;for(;i<e.length;){let t=e[i],a=void 0===t?null:b(t,r);if(null!==a&&a<=n)break;i+=1}return i}(e,i,l,t),o=e.slice(i+1,s);if(o.some(t)){"heading"===a.kind&&(r=a.level),n.push(a),i+=1;continue}let c="heading"===a.kind?a.level:function(e){let t=Math.min(6,Math.max(2,e));return 2===t||3===t||4===t||5===t?t:6}(r+1);n.push({kind:"section",title:function(e){if("heading"===e.kind)return e.children;if("paragraph"===e.kind){let t=e.children[0];return t?.kind==="strong"?t.children:e.children}return[]}(a),level:c,body:o}),i=s}return n}(n,g):n;i[4]===Symbol.for("react.memo_cache_sentinel")?(e={fontSize:"var(--text-sm)"},i[4]=e):e=i[4],r=(0,t.jsx)("div",{className:`max-w-[70ch] text-ink ${f??""}`,style:e,children:x.map(_)}),i[0]=f,i[1]=v,i[2]=a,i[3]=r}else r=i[3];return r}],838873)}]);