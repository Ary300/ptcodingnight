#!/bin/sh
# Regenerates the .class files beside each Main.java with the judge's JAVA_21 javac flags.
# Run from the repo root:
#   docker run --rm -v "$PWD/fixtures/judge/classfiles:/c" ptcn-jdk:21 sh /c/compile.sh
# The class files are checked in so worker/jvm-classfile.test.ts needs no JDK on the host.
set -eu
for dir in /c/*/; do
  rm -f "$dir"*.class
  javac --release 21 -proc:none -nowarn -d "$dir" "$dir/Main.java"
done
