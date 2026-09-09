/**
 * The loudspeaker.
 *
 * CSIRAC had no sound hardware. The speaker was wired to destination P, and a
 * word sent there went to it as a train of digit pulses. So the pitch you heard
 * was simply how often the program sent a word: a loop of four commands gives
 * a cycle every four command times, and the timbre came from how many digits
 * were set in the word. That is how CSIRAC came to play music in 1950, the
 * first computer anywhere to do so.
 *
 * The DOS emulator could not reproduce any of this. It played a fixed 220 Hz
 * blip for every non-zero word, and its notes say as much: "it is not possible
 * to reproduce the CSIRAC music, which uses variations in the digit trains sent
 * to the speaker".
 *
 * Here the pulses are kept with the instruction count at which they happened,
 * and the waveform is built from those. Pitch therefore comes out of the
 * program rather than being imposed, and it stays right however fast the
 * emulator is being run: the emulator's speed and the speed of the sound are
 * two different things.
 */

/**
 * How long one command took on CSIRAC.
 *
 * The machine ran at about a thousand commands a second, so the two command
 * hoot in the programming manual sounds at about 500 Hz and a four command
 * loop at about 250. Everything audible follows from this one number.
 */
export const COMMAND_SECONDS = 0.001;

/** A word sent to the speaker, and when. */
interface Pulse {
    word: number;
    at: number;
}

export class Speaker {
    private context: AudioContext | null = null;
    private gain: GainNode | null = null;
    /** Where the next rendered buffer starts, in the audio context's clock. */
    private nextStart = 0;
    /** The instruction count the last buffer was rendered up to. */
    private renderedTo = 0;
    private pending: Pulse[] = [];

    /** Record a word going to the speaker. */
    push(word: number, at: number): void {
        this.pending.push({ word, at });
    }

    /** True if anything is waiting to be heard. */
    get hasPulses(): boolean {
        return this.pending.length > 0;
    }

    /**
     * Turn everything collected so far into sound.
     *
     * Called once per batch of instructions. The buffer covers the emulated time
     * from where the last one ended up to the last pulse, so the pieces join
     * without a seam.
     */
    flush(now: number): void {
        if (this.pending.length === 0) return;
        const pulses = this.pending;
        this.pending = [];

        const context = this.open();
        if (!context || !this.gain) return;

        // A batch that arrives after a long silence starts a fresh span, so that
        // silence is not rendered as an enormous empty buffer.
        const first = pulses[0].at;
        if (this.renderedTo === 0 || first - this.renderedTo > 2000) this.renderedTo = first;

        const spanCommands = Math.max(now, pulses[pulses.length - 1].at + 1) - this.renderedTo;
        const seconds = spanCommands * COMMAND_SECONDS;
        if (seconds <= 0) return;

        const rate = context.sampleRate;
        const frames = Math.ceil(seconds * rate);
        if (frames <= 0 || frames > rate * 5) {
            // More than a few seconds in one go means the emulator has run far ahead
            // of the sound; drop it rather than queue a backlog.
            this.renderedTo = now;
            return;
        }

        const buffer = context.createBuffer(1, frames, rate);
        const samples = buffer.getChannelData(0);

        for (const pulse of pulses) {
            const offset = Math.floor((pulse.at - this.renderedTo) * COMMAND_SECONDS * rate);
            if (offset < 0 || offset >= frames) continue;
            // The word's digits set how hard the speaker is driven, which is what
            // gives one program a different voice from another.
            const strength = popCount(pulse.word) / 20;
            writeClick(samples, offset, strength, rate);
        }

        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.gain);

        // Keep the pieces butted together, catching up if the sound has fallen
        // behind the clock.
        const startAt = Math.max(this.nextStart, context.currentTime + 0.02);
        source.start(startAt);
        this.nextStart = startAt + seconds;
        this.renderedTo += spanCommands;
    }

    /** Forget anything queued, for when a program is stopped or restarted. */
    reset(): void {
        this.pending = [];
        this.renderedTo = 0;
        this.nextStart = 0;
    }

    close(): void {
        this.reset();
        void this.context?.close();
        this.context = null;
        this.gain = null;
    }

    private open(): AudioContext | null {
        try {
            if (!this.context) {
                this.context = new AudioContext();
                this.gain = this.context.createGain();
                this.gain.gain.value = 0.18;
                this.gain.connect(this.context.destination);
            }
            if (this.context.state === "suspended") void this.context.resume();
            return this.context;
        } catch {
            // No audio available; the emulator carries on in silence.
            return null;
        }
    }
}

/**
 * One pulse: a sharp rise and a quick decay, which is what a speaker driven by
 * a digit train actually does. A train of these at rate f is heard as a tone
 * of pitch f, with the buzz that CSIRAC was known for.
 */
function writeClick(samples: Float32Array, offset: number, strength: number, rate: number) {
    const length = Math.max(2, Math.round(rate * 0.0004));
    for (let n = 0; n < length && offset + n < samples.length; n++) {
        const decay = 1 - n / length;
        samples[offset + n] += strength * decay * decay;
    }
}

/** How many digits of the word are set. */
function popCount(word: number): number {
    let count = 0;
    for (let bit = 0; bit < 20; bit++) if (word & (1 << bit)) count++;
    return count;
}
