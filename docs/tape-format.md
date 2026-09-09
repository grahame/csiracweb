# What is punched on a program tape

The 12-hole row format is documented: `mm nnXY`, two scale-32 numbers with an
`X` in column 6 and a `Y` in column 7, and section 4.10 of the programming
manual gives the twelve channels as X and Y for p19 and p20 and the other ten
for p10 to p1.

What is *not* documented anywhere to hand is the small assembler language the
primary reads: how rows become words at addresses. This is what was worked out
by experiment, because guessing at it produced a listing that confidently
placed a program in the wrong part of store.

## The method

Do not reason about it. Build a candidate tape, run it through a real machine
with `Machine.onStore` attached, and watch where the words land:

```ts
const m = new Machine()
m.programTape = new Tape('t.cvt', candidate)
m.initialize()
m.readPrimary()
m.onStore = (address, word) => console.log(address, word)
m.s = 0
m.beginExecution()
runToStop(m, 500_000)
```

The primary is the authority on its own format. Ask it.

## What was established

**A tape is read in two stages.** The primary at the head is read by the
machine's own hardware read cycle, one row to one word, stored at consecutive
addresses, ending at the first blank row. Everything after that is read by the
primary now running as a program.

**In the second stage, the punches say what a row is:**

| Row | Meaning |
| --- | --- |
| plain, non-blank | the address digits for the row that follows |
| `X` punch | completes an instruction: this row carries source and destination |
| `Y` punch | a control statement |
| `31 31XY` | the DO, which ends the reading. Every hole punched |

**A bare `hh ll Y` sets the load address to its own digits.** Verified: a tape
of `' 0 20 Y'` followed by two `X` rows stored those two words at `0 20` and
`0 21`. This is the one that matters and the one that is easiest to get wrong.

**A control statement takes the plain row before it as its operand.** The
manual writes the control statement `4A` as the two rows `0 4` and `0 2Y`, and
A2Test's own comments confirm it: `2 0` followed by `0 0Y` carries the comment
"set load address to 2,0 == 64". So the pending address digits belong to the
control statement, not to the next instruction. Missing this makes every word
assembled after any control statement wrong.

**Rows and store writes cannot be matched by position.** The input register runs
a row behind the reader, so the primary has read on by one or two rows by the
time it stores what it assembled; and once control is handed over the program
writes to store on its own account, so there are more writes than rows.
`listing.ts` matches them on the assembled word instead, with a short lookahead
to resynchronise.

## What was not established

**Control statements other than "set the load address".** SQRT and A2Test carry
`0 1 Y` and `0 2 Y` with operands before them, which are evidently other kinds
of statement. Their meanings are unknown.

**How to hand-build a tape in the two-row form.** Appending the primary from an
existing tape, a `0 20 Y`, some `X` rows and a `31 31XY` did not load and
transfer control; the reader ran to the end of the tape. Something about the
sequence is still wrong, and it is why `tools/make-tunes.mjs` writes tapes in
the primary form instead, which caps them at the 768 words the sequence
register reaches.

An assembler for arbitrary addresses needs this solved. The method above is how
to solve it: vary one thing at a time and watch the store.

## The primary form, which does work

Rows at the head of a tape go straight into store, one row to one word, and run
from `0 0`. That needs no primary and no control statements, which is what the
starter tape and the tune tapes use:

```
25  2  PL OT: a one in p1, printed on the teleprinter
25 31  PL  T: a one to the stop gate, which halts the machine
```

Its limit is that a single row carries only the p1 to p10 digits plus the X and
Y punches, so the only reachable addresses are `0 0`, `8 0`, `16 0` and `24 0`.
A backward jump is possible without a full address by putting a word whose low
digits are the target early in the tape, then `M HL` to load H from it and
`HU S` to jump there; that is untried but follows from the gate definitions.
