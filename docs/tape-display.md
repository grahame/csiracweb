# Showing the readers at work

A design note, not an implementation. It works out how the tape readers and
the reading of a program might be shown, what the manuals settle, what has
been measured, and what would have to be built.

**The strip has since been built**, as `src/ui/TapeStrip.tsx` and
`src/ui/Readers.tsx`, with `src/emulator/punching.ts` reading a tape as its
punching. What follows is the design it was built to, kept as the record of
what the manuals settle and what they do not.

**The listing follows the head too**, in `TapeViewer.tsx`: the row under the
head and the row already in the input register are marked in the same two
colours the strip uses, and the listing scrolls to keep up. The other thing it
leads to, store filling as it loads, is still to do.

## Why it is worth doing

Paper tape is the part of CSIRAC least served by the console as it stands. The
operations menu says `READER: 12 HOLE` and `Use program file`, which is accurate
and tells a newcomer nothing. Two of the three times a program has gone wrong
in the making of this emulator, the cause was the reader: the `U` switch not
being pressed for SQRT, and the input register running a row behind in
`player.cvt`. Both would have been obvious if the tape were visible.

## What the manuals settle

**A row is its channels.** From section 4.10 of the programming manual, on
12-hole tape: *"Channels X and Y correspond to positions P19 and P20, the
remaining 10 channels are read into positions P10 to P1."* So the twelve punch
positions are exactly the twelve digits the format carries, and a row can be
drawn as itself:

```
row        value    p10-p6  p5-p1  X Y   twelve punch positions
"17 18  "      562   10001 10010  0 0   o...oo..o...
"26 17X "   262993   11010 10001  1 0   oo.o.o...oo.
" 0  0  "        0   00000 00000  0 0   ............   blank tape, ends the primary
"31 31XY"   787455   11111 11111  1 1   oooooooooooo   the DO, every hole punched
```

For 5-hole tape, section 4.2: *"codes from 5-hole tape enter the input register
in the P5-P1 digit positions."*

**Sprocket holes.** The manual's own tape diagram, page 53, draws 5-hole tape
with the feed hole in every row, smaller than the data holes, with **two
channels on one side and three on the other**. For 12-hole tape the manual says
only to insert it *"sprocket holes side towards hinge"*, so the feed hole is off
centre, but where exactly is not stated and should not be invented.

**The printed leader.** A photograph of a surviving CSIRAC library tape, held by
the Computer History Museum as `500003011p-03-01`, shows the head of tape T 351:

> CSIRAC LIBRARY · T 351 .B113 · FLOATING INVERSE OF FRACTION
> Four routines follow; T351.1 +ve inverse, T351.2 -ve inverse, T351.3 -ve
> inverse, T351.4 +ve inverse. Error less than 2p1 defect for first two,
> excess for next two.

The title is set in large letters built out of asterisks, with the description
typed below in ordinary characters. This is the same thing as the heading rows
our tapes carry past column 7, and the listing already classifies them as
headings, so a strip should print the leader as text rather than drawing it as
punching.

It does not answer the sprocket question. The photograph is of the printed
leader, which carries no data holes: measuring across it gives dark columns at
irregular spacings, which are letter strokes and not a channel grid.

**A punched reel.** A second photograph, of a reel of punched tape, gives the
general form though not CSIRAC's particular layout. Measuring it: the tape runs
at 27 degrees across the frame, and of 44 holes found on the flat run, 17 lie
on one continuous track punched in essentially every row while the other 27 are
scattered. Their offsets from that track fall near multiples of about 20 pixels
— 19, 40, 61, 83, 106, 128, 151, 162, 187 — so the channels are on a uniform
pitch and the continuous track sits toward one edge rather than down the middle.
That is the shape a feed hole takes, and it agrees with the manual's direction
to load a tape "sprocket holes side towards hinge".

It settles no more than that. The photograph carries no caption or source, so
there is nothing to say it is CSIRAC's tape rather than any other machine's,
and at four hundred pixels across the channel count cannot be read off: the
spacings fit anywhere between ten and twelve data channels. The one test that
would have confirmed the track as a feed hole, that it is punched smaller than
a data hole, is spoiled by resolution, since holes close together along a
continuous track merge into single blobs and measure larger rather than
smaller.

So: draw a feed track, continuous, on a uniform pitch with the data channels,
offset toward one edge. Do not claim its exact channel position for CSIRAC.

**The reader runs a row ahead.** Section 4.2: *"When the code in the input
register has been transmitted, the tape is automatically advanced one row and
the code is loaded into the input register in place of that transmitted."* The
head is therefore always one row ahead of the word the program is working on.
This is the behaviour that made `player.cvt` stop dead, and it is worth drawing
rather than explaining.

**Reading a tape in is a procedure.** Section 4.9 gives the switchboard steps,
and they are the two stages the emulator already models: insert the tape,
restart until the first row appears on the input neons, clear the registers and
the sequence register, restart and *"stop computer when reader is resting on
blank tape after primary"*, clear the sequence register again, then *"restart to
read in programme tape"*. A tape stopping on blank tape is a picture.

## What has been measured

At CSIRAC speed, about a thousand commands a second, reading a tape in is
something to watch rather than something instant:

| Tape | Rows | Load | Reader rate |
| --- | --- | --- | --- |
| `T712A.cvt` | 96 | 0.4 s | 111 rows/sec |
| `Sqrt.cvt` | 205 | 2.0 s | 83 rows/sec |
| `A2Test.cvt` | 487 | 4.9 s | 91 rows/sec |
| `InterProgram.cvt` | 3715 | 4.8 s | 100 rows/sec |

About 90 rows a second is roughly one and a half rows per animation frame:
quick enough to read as machinery, slow enough to follow. These are rates the
emulation produces at a thousand commands a second, not a measurement of how
fast CSIRAC's photoelectric reader actually ran, which is not to hand.

## The strip

A strip of tape running through a reader head, drawn as the tape itself.

Running the tape **vertically**, rows across, matches the manual's diagram and
the tape listing, and lets the strip sit in a narrow column beside the
register displays without crowding them.

```
        channels                    what it is
      ..o.oo..o...   row 41         already read, scrolling away
      oo.o.o...oo.   row 42
    > ....oo.ooo..   row 43   <--   in the input register
    # o...oo..o...   row 44   <--   under the read head
      ............   row 45         to come
      oooooooooooo   row 46
```

Two marks, not one: the head, and the row already transmitted. The gap between
them is the manual's *"advanced one row"*, made visible.

Proportions, following the manual's diagram rather than any measurement of real
tape: data holes on a uniform pitch across and along, the feed hole smaller and
between channels 2 and 3 for 5-hole tape. For 12-hole the feed hole should
either be left out or drawn between the two groups of five with a note that its
true position is not known; inventing it would be the one dishonest pixel in an
otherwise faithful picture.

Both readers drawn together, the unselected one dark, so that `R` and `U` stop
being words and become a lamp on one of two machines.

## What it would take

**A component.** Canvas rather than SVG, as `Crt.tsx` already is: forty visible
rows of twelve holes is some five hundred shapes a frame, which is nothing for
canvas and a lot of DOM nodes to churn.

```ts
interface TapeStripProps {
  rows: readonly number[]   // the punched values, in order
  channels: 5 | 12
  head: number              // the row under the read head
  transmitted: number       // the row already in the input register
  live: boolean             // is this the selected reader
  label: string             // "12 HOLE, program" and so on
}
```

**Three gaps in the plumbing.**

1. `Tape.position` exists but does not reach the view. `snapshot()` in
   `useMachine.ts` would carry the position of each tape, which is a line each.

2. The strip needs the rows as numbers. `analyseProgramTape` gives them but
   runs a whole machine to do it, so it cannot be called per frame; a cheap
   `parseRow` per line, memoised on the tape text, is what is wanted. The text
   is already held in the controller.

3. Nothing records where the head was, only where it is. Scrubbing back through
   a load, if that is ever wanted, would need the read events kept with their
   command counts, the way the speaker already keeps its pulses.

**Speed.** Wound on, the tape will fly past. Let it: a racing reader is honest
and shows the emulator running ahead. Cap the redraw so it does not strobe.

## What this leads to

The strip is the foundation. Two things build on it and neither is worth doing
first:

- ~~**The listing following the head.**~~ Built. The annotated listing already
  knew which row becomes which word at which address; tying it to the read
  position turned that from a table into something watched.
- **Store filling as it loads.** `Machine.onStore` already reports every write.
  A thousand and twenty-four cells lighting up as the words land is what
  "reading the program in" actually looks like, and it would show the
  primary's own twenty words going in first, by the different mechanism.

## Open questions

- Which channel the feed hole sits between on CSIRAC's 12-hole tape. Its
  general form is settled — continuous, uniform pitch, toward one edge — but a
  photograph of a punched CSIRAC tape, with something to say it is one, would
  be needed to place it exactly. Drawing it toward one edge without marking a
  particular channel is honest; claiming a channel is not.
- Whether the strip should print a tape's heading rows as the leader text they
  are, in the way a real tape carried its title in asterisks.
- Whether the strip belongs on the console permanently, as reader status, or
  only in the tape viewer. Probably a narrow one on the console and the full
  one, coupled to the listing, in the viewer.
- Whether the punch deserves the same treatment, tape emerging with holes
  appearing. The output side is already paced correctly by the program, so it
  would come almost free once the strip exists.
