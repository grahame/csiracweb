/**
 * Binary register readouts, in the two styles the DOS emulator offered.
 *
 * The default shows ones and zeroes in groups of five, the grouping CSIRAC
 * programmers used because addresses and function numbers were quoted in
 * scale 32. The alternative fills in a block for each one and leaves a zero
 * blank, which the original described as "more like CSIRAC" because it reads
 * like the neon indicator lamps on the cabinets.
 */

interface BinaryProps {
    word: number;
    digits?: number;
    /** False to draw blocks instead of ones and zeroes. */
    asDigits?: boolean;
    /**
     * The A, B and C displays used a different pair of block characters from the
     * rest, so that the accumulators stood out.
     */
    accumulator?: boolean;
}

export function Binary({ word, digits = 20, asDigits = true, accumulator = false }: BinaryProps) {
    const groups: string[] = [];
    let group = "";

    for (let index = 0; index < digits; index++) {
        const isOne = (word & (1 << (digits - 1 - index))) !== 0;
        if (asDigits) group += isOne ? "1" : "0";
        else if (accumulator) group += isOne ? "▲" : "_";
        else group += isOne ? "■" : " ";

        if (group.length === 5) {
            groups.push(group);
            group = "";
        }
    }
    if (group.length > 0) groups.push(group);

    return <span className="binary">{groups.join(asDigits ? " " : "")}</span>;
}
