// Compile-memory bomb: constant folding doubles a string 31 times, and javac runs out of heap.
// Must be CE with what javac says, never IE.
public class Main {
  static final String S0 = "0123456789abcdef";
  static final String S1 = S0 + S0;
  static final String S2 = S1 + S1;
  static final String S3 = S2 + S2;
  static final String S4 = S3 + S3;
  static final String S5 = S4 + S4;
  static final String S6 = S5 + S5;
  static final String S7 = S6 + S6;
  static final String S8 = S7 + S7;
  static final String S9 = S8 + S8;
  static final String S10 = S9 + S9;
  static final String S11 = S10 + S10;
  static final String S12 = S11 + S11;
  static final String S13 = S12 + S12;
  static final String S14 = S13 + S13;
  static final String S15 = S14 + S14;
  static final String S16 = S15 + S15;
  static final String S17 = S16 + S16;
  static final String S18 = S17 + S17;
  static final String S19 = S18 + S18;
  static final String S20 = S19 + S19;
  static final String S21 = S20 + S20;
  static final String S22 = S21 + S21;
  static final String S23 = S22 + S22;
  static final String S24 = S23 + S23;
  static final String S25 = S24 + S24;
  static final String S26 = S25 + S25;
  static final String S27 = S26 + S26;
  static final String S28 = S27 + S27;
  static final String S29 = S28 + S28;
  static final String S30 = S29 + S29;
  static final String S31 = S30 + S30;
  public static void main(String[] a) { System.out.println(S31.length()); }
}
