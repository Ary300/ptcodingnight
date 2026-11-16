# C/C++ judge runtime with a precompiled <bits/stdc++.h>.
#
# The editor's C++ starter opens with `#include <bits/stdc++.h>`, so nearly every C++ submission
# pays to parse the whole standard library before it reaches a line the student wrote. Measured
# inside the judge's compile limits (--cpus=2, 1 GB, read-only rootfs), one 10-line solution:
#
#     explicit headers                       190-203 ms CPU
#     <bits/stdc++.h>                        577-612 ms CPU
#     <bits/stdc++.h> with this PCH          123 ms CPU, BYTE-IDENTICAL binary
#
# GCC looks for `<header>.gch` beside the header before it opens the header, so placing the PCH
# next to the real bits/stdc++.h needs no flag in the compile command and no change for students.
#
# ## A PCH that does not match is ignored SILENTLY, and that is why the flags are an ARG
#
# GCC uses a precompiled header only when it was built with the same -std, -O and code-generation
# flags as the compile that includes it. A mismatch is not an error: GCC quietly parses the header
# from source and the compile is correct and four times slower. So the flags below are never typed
# here. scripts/build-judge-images.sh reads the CPP_17 compile command from lib/judge/runtimes.ts
# (scripts/print-compile-command.ts) and passes its flags in, and `--verify` compiles with the
# judge's own command and `-H` and fails unless GCC reports the PCH as used (`! …stdc++.h.gch`).
#
# Unlike Go's build cache, a PCH carries no clock: GCC validates it against the compiler binary and
# the flags, never against a timestamp, so it cannot rot with age. It can only drift with a flag
# change, which `--verify` catches.
#
# Only CPP_17 is offered to students, so only its flags are precompiled. CPP_11 and C_17 still
# work; they parse the header as before.
#
# Pinned by digest, the same bytes scripts/build-judge-images.sh pins for gcc:14.
FROM gcc:14@sha256:1ea81e094f614fd2ed066316651dbac8eecb4d36add2ddd8a26151374c85c52c

ARG CXX17_FLAGS

RUN test -n "$CXX17_FLAGS" \
 && header=$(echo '#include <bits/stdc++.h>' \
      | g++ $CXX17_FLAGS -x c++ -H -fsyntax-only - 2>&1 \
      | sed -n 's/^\. \(.*bits\/stdc++\.h\)$/\1/p' | head -n 1) \
 && test -f "$header" \
 && g++ $CXX17_FLAGS -x c++-header -o "$header.gch" "$header" \
 && chmod a+r "$header.gch" \
 && ln -s "$header.gch" /opt/ptcn-stdcpp.gch \
 && printf '%s\n' "$CXX17_FLAGS" > /opt/ptcn-stdcpp.flags
