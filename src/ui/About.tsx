/**
 * Where this page came from.
 *
 * This was the credit at the foot of every screen, which is four paragraphs of
 * history under a machine somebody is trying to work. The footer keeps the one
 * thing that has to be on every screen — whose emulator this is a port of —
 * and a way here; the rest of it is this page.
 */

import { Link } from "react-router";

export function About() {
    return (
        <div className="about-screen">
            <h2>About this emulator</h2>

            <p>
                CSIRAC was Australia&rsquo;s first digital computer, and the fourth stored program computer in the
                world. It ran from 1949 to 1964 and survives{" "}
                <a href="https://cis.unimelb.edu.au/about/history/csirac" target="_blank">
                    intact at Museums Victoria
                </a>
                , the only first-generation machine anywhere to have been preserved whole.
            </p>

            <p>
                Various{" "}
                <a href="https://cis.unimelb.edu.au/about/history/csirac/emulator" target="_blank">
                    emulators for CSIRAC have been developed
                </a>
                . This one is a port of <strong>CSIRACEM</strong>, written in Turbo Pascal 6 by{" "}
                <strong>John W. Spencer</strong>, who used CSIRAC from 1959 to 1964. In 2011 &ndash; some fifteen years
                ago! &ndash; he was kind enough to share the source code with{" "}
                <a href="https://grahame.dev/">Grahame Bowland</a>, the author of this page, and to give permission for
                it to be ported to the web. CSIRACEM required a DOS machine or emulator to run, which has become
                increasingly difficult; this page needs nothing more than a web browser. It also draws upon some CSIRAC
                tape images which were included with Bill Purvis&rsquo; 2021 Java port of the emulator, but does not
                otherwise rely on that work.
            </p>

            <p>
                Claude Code was used substantially in developing this page, primarily in taking the Turbo Pascal
                emulator and porting it to Typescript. Some human code review of the generated code has been carried
                out, but this has not been by any means exhaustive.
            </p>

            <p>
                <a href="https://github.com/grahame/csiracweb">The source code is on GitHub.</a>
            </p>

            <p className="tape-launch">
                <Link to="/">Back to the tapes</Link>
            </p>
        </div>
    );
}
