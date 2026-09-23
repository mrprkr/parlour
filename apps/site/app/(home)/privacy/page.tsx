import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What Parlour, the iOS app and this site collect, where it goes, and what we promise about any service we offer later.",
  alternates: { canonical: "/privacy" },
};

// Changing what this page promises means changing this date, and saying so on the page.
const updated = "23 September 2026";

export default function Privacy() {
  return (
    <main className="book policy">
      <section className="opening" aria-labelledby="privacy-title">
        <h1 id="privacy-title">Privacy policy</h1>
        <p className="lede">
          Parlour is built so that we never see what you say to it. This page says what that means for the
          Mac, the iOS app and this site, and what we promise about any service we offer in future.
        </p>
        <p className="policy-updated">Last updated {updated}.</p>
      </section>

      <section className="sheet" aria-labelledby="short-heading">
        <h2 id="short-heading">The short version</h2>
        <ul>
          <li>We do not run a server that your voice, your requests or your house data pass through.</li>
          <li>
            We have no accounts, no advertising and nothing to sell, and no tracking beyond the cookieless visit
            counts on this site.
          </li>
          <li>The iOS app talks to your own Mac, and to nothing of ours.</li>
          <li>
            If you choose to connect a cloud service, such as a cloud model or a search provider, your Mac
            talks to that service directly under your own account, and its privacy policy applies.
          </li>
          <li>
            This site counts visits without cookies, and nothing more. That is the only data that reaches us.
          </li>
        </ul>
      </section>

      <section className="sheet" aria-labelledby="who-heading">
        <h2 id="who-heading">Who we are</h2>
        <p>
          Parlour is free, open-source software released under the MIT licence and maintained by the people
          who publish it at <a href="https://github.com/mrprkr/parlour">github.com/mrprkr/parlour</a>. In this
          policy, "we" means those maintainers and "Parlour" means the npm package, the desktop app, the iOS
          app, the phone page and this website, heyparlour.app. The source is public, so every claim on this
          page can be checked against the code.
        </p>
      </section>

      <section className="sheet" aria-labelledby="mac-heading">
        <h2 id="mac-heading">Parlour on your Mac</h2>
        <p>
          The server, the desktop app and the command line run on a Mac you own. The wake word, the
          transcription, the local model and the voice all run there. Your configuration and skills are kept
          in <code>~/.config/parlour</code>, secrets in the macOS keychain or a file there that only your user
          can read, downloaded models in <code>~/Library/Caches/parlour</code>, and logs in{" "}
          <code>~/Library/Logs/parlour</code>. The logs include the text of what Parlour heard and said, so
          they stay on the Mac with everything else. Nothing is sent to us.
        </p>
        <p>
          Some features reach the internet only because you switch them on and give them a key of your own:
        </p>
        <ul>
          <li>
            <strong>A cloud model</strong> (Anthropic's Claude by default). When the local model cannot
            answer, the text of the request, never the recording, is sent to the provider you configured, with
            its web search if you allow it. House tools are never given to the cloud model.
          </li>
          <li>
            <strong>Web search</strong> (Brave or a SearXNG instance), which receives the search terms.
          </li>
          <li>
            <strong>Integrations</strong> such as Home Assistant, MCP servers and connectors, which receive
            whatever you ask Parlour to do with them.
          </li>
          <li>
            <strong>Model and dependency downloads</strong> during setup, fetched from their public hosts like
            any other download.
          </li>
        </ul>
        <p>
          Those services are yours, reached with your credentials. We are not a party to them and never see
          the traffic. Please read their privacy policies before switching them on.
        </p>
      </section>

      <section className="sheet" aria-labelledby="ios-heading">
        <h2 id="ios-heading">The iOS app</h2>
        <p>
          The iOS app is a client of the Parlour server on your Mac. It sends recordings and typed requests to
          the address you paired it with, and plays the answer back. It contains no analytics, advertising,
          crash reporting or tracking code, and it does not contact any server run by us.
        </p>
        <h3>What it keeps on the phone</h3>
        <ul>
          <li>The address of your server and your settings, in the app's own storage.</li>
          <li>
            The server's access token, in the iOS keychain, marked to stay on this device and out of backups.
          </li>
          <li>
            Nothing you record. The latest recording is held in memory until you record again or close the
            app, and is never saved. For the on-device answer it is written to a temporary file that is
            deleted as soon as it has been transcribed.
          </li>
        </ul>
        <h3>What it asks for, and what happens to it</h3>
        <ul>
          <li>
            <strong>Microphone.</strong> Records only while you hold the talk button. The recording goes to
            your server, or, if you have switched on the on-device answer and home cannot be reached, it is
            transcribed on the phone.
          </li>
          <li>
            <strong>Local network.</strong> Finds your server with Bonjour and talks to it. Servers found this
            way are never used until you pair with one.
          </li>
          <li>
            <strong>HomeKit.</strong> Shows your rooms and accessories on the House tab. HomeKit data stays on
            the phone and in your house. It is not sent to us, not sold, not used for advertising and not used
            for anything but showing and controlling your home.
          </li>
          <li>
            <strong>Speech recognition.</strong> Used only for the on-device answer, and the app requires
            recognition to happen on the phone: a recogniser that would send audio to Apple is refused.
          </li>
          <li>
            <strong>Camera.</strong> Used only while you scan a pairing code. No image is stored or sent.
          </li>
        </ul>
        <p>
          The on-device answer uses Apple's Foundation Models, which run on the phone. Apple's own handling of
          Apple Intelligence, HomeKit and the App Store is covered by{" "}
          <a href="https://www.apple.com/legal/privacy/">Apple's privacy policy</a>. Apple may share aggregate
          App Store and crash statistics with developers if you have allowed it in iOS Settings; these do not
          identify you and we do not combine them with anything else.
        </p>
      </section>

      <section className="sheet" aria-labelledby="site-heading">
        <h2 id="site-heading">This website</h2>
        <p>
          heyparlour.app is hosted by Vercel. Like any web host, Vercel handles your IP address and browser
          details to serve the pages and to protect the site from abuse. We use Vercel Web Analytics to count
          page views: it sets no cookies, does not follow you across sites and gives us only aggregate figures
          such as pages, referrers, countries and device types. Fonts are served from this site, so no third
          party learns that you visited. The site has no forms, accounts or newsletter.
        </p>
        <p>
          If you open an issue or a pull request on GitHub, or install the package from npm, those services'
          own policies apply to what you give them.
        </p>
      </section>

      <section className="sheet" aria-labelledby="future-heading">
        <h2 id="future-heading">Services we may offer in future</h2>
        <p>
          We may one day offer optional hosted services, such as reaching your house securely from outside,
          push notifications, a relay for the iOS app, accounts or a paid tier. None exist today. If we build
          one, these rules apply to it:
        </p>
        <ul>
          <li>It will be optional. Parlour will keep working fully on your own network without it.</li>
          <li>It will collect only what it needs to work, and we will say exactly what that is.</li>
          <li>
            Where a service only carries traffic between your devices and your house, we will encrypt it so
            that we cannot read it wherever that is possible.
          </li>
          <li>
            We will not sell your data, use it for advertising, or use your recordings, requests or house data
            to train models.
          </li>
          <li>
            We will name the companies that process data for us, keep data only as long as the service needs
            it, and let you export and delete it.
          </li>
          <li>
            We will update this page before the service launches, and nothing it collects will be gathered
            before you agree to it.
          </li>
        </ul>
      </section>

      <section className="sheet" aria-labelledby="rights-heading">
        <h2 id="rights-heading">Your rights</h2>
        <p>
          Because Parlour keeps your data on your own devices, you are in control of it. On the Mac, delete{" "}
          <code>~/.config/parlour</code>, <code>~/Library/Logs/parlour</code> and{" "}
          <code>~/Library/Caches/parlour</code>; on the phone, delete the iOS app; and it is gone. Wherever
          you live, including under the GDPR, the UK GDPR and the Australian Privacy Principles, you may ask
          us what personal information we hold about you, and have it corrected or deleted. Today the honest
          answer is that we hold none beyond the aggregate site statistics above.
        </p>
        <p>
          Parlour is not directed at children and we do not knowingly collect information from anyone under
          16.
        </p>
      </section>

      <section className="sheet" aria-labelledby="contact-heading">
        <h2 id="contact-heading">Changes and contact</h2>
        <p>
          When this policy changes, we will update the date at the top of this page, and the full history is
          in the repository. For questions about privacy, open an issue at{" "}
          <a href="https://github.com/mrprkr/parlour/issues">github.com/mrprkr/parlour/issues</a>. For
          anything you would rather not say in public, use{" "}
          <a href="https://github.com/mrprkr/parlour/security/advisories/new">a private report</a> instead.
          See also <Link href="/docs/ios">the iOS app</Link> and{" "}
          <Link href="/docs/architecture">the architecture</Link> for how the pieces fit together.
        </p>
      </section>
    </main>
  );
}
