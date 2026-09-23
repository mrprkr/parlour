import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What Parlour, the iOS app and this site collect, where it goes, and how a future, opt-in Parlour Cloud would handle your data.",
  alternates: { canonical: "/privacy" },
};

// Changing what this page promises means changing this date, and saying so on the page.
const updated = "24 September 2026";

export default function Privacy() {
  return (
    <main className="book policy">
      <section className="opening" aria-labelledby="privacy-title">
        <h1 id="privacy-title">Privacy policy</h1>
        <p className="lede">
          Parlour is built so that we never see what you say to it. This page says what that means for the
          Mac, the iOS app and this site, and how Parlour Cloud, an opt-in paid service we may offer in
          future, would handle your data if you chose to use it.
        </p>
        <p className="policy-updated">Last updated {updated}.</p>
      </section>

      <section className="sheet" aria-labelledby="short-heading">
        <h2 id="short-heading">The short version</h2>
        <ul>
          <li>
            Parlour runs on your own devices. Unless you sign up to Parlour Cloud, your voice, your requests
            and your house data never pass through a server of ours.
          </li>
          <li>
            We never sell your data or use it for advertising, and there is no tracking beyond the cookieless
            visit counts on this site.
          </li>
          <li>The iOS app talks to your own Mac, and to nothing of ours unless you turn Parlour Cloud on.</li>
          <li>
            If you choose to connect a cloud service, such as a cloud model or a search provider, your Mac
            talks to that service directly under your own account, and its privacy policy applies.
          </li>
          <li>
            Parlour Cloud does not exist yet. If we launch it, it will be optional and paid, it will collect
            only what it needs, and it will never be used to train models. Parlour will keep working fully
            without it.
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
          crash reporting or tracking code, and it does not contact any server run by us unless you switch on
          Parlour Cloud.
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

      <section className="sheet" aria-labelledby="cloud-heading">
        <h2 id="cloud-heading">Parlour Cloud</h2>
        <p>
          We may offer Parlour Cloud: managed services, run by us, that you can add to Parlour for a fee. It
          might include a hosted model for requests your Mac cannot answer on its own, reaching your house
          securely from outside, a relay and push notifications for the iOS app, and backups of your
          configuration. None of it exists today, and nothing below applies until it does and you sign up.
        </p>
        <p>
          It will always be opt-in. Nothing in the free software will send data to Parlour Cloud until you
          create an account and switch a service on, one service at a time. If you cancel, Parlour carries on
          working on your own network exactly as before.
        </p>

        <h3>What it would collect</h3>
        <ul>
          <li>
            <strong>Your account.</strong> An email address, a name if you give one, and the settings for the
            services you have switched on.
          </li>
          <li>
            <strong>Billing.</strong> Payments would be taken by a payment processor such as Stripe. We would
            see your plan, your payment history and the last digits of your card, never the full card number.
          </li>
          <li>
            <strong>What a service needs to do its job.</strong> A hosted model receives the text of the
            requests your Mac sends it, never the recording. Remote access and the relay carry traffic between
            your devices and your house, end-to-end encrypted wherever that is possible so that we cannot read
            it. Backups are encrypted before they leave your Mac.
          </li>
          <li>
            <strong>Running the service.</strong> IP addresses, device and app versions, timestamps, usage
            counts for billing and limits, and error reports, used to keep the service working, secure and
            fairly billed.
          </li>
        </ul>

        <h3>What we would do with it, and what we would not</h3>
        <ul>
          <li>Use it only to provide, secure, bill for and support the services you have chosen.</li>
          <li>
            Never sell it, use it for advertising, or use your recordings, requests or house data to train
            models, ours or anyone else's.
          </li>
          <li>
            Not keep the content of requests once they are answered, beyond short-lived logs kept to
            investigate abuse or faults, which are deleted within 30 days.
          </li>
          <li>
            Share it only with the companies that run parts of the service for us (such as hosting, payments,
            email and model providers), under contracts that hold them to the same terms, and we will list
            them by name on this page before launch. Model providers will be chosen and configured so that
            they do not train on your requests or keep them longer than they need to.
          </li>
          <li>
            Disclose it to authorities only when the law requires it, and tell you when we are allowed to.
          </li>
        </ul>

        <h3>Where it lives and how long we keep it</h3>
        <p>
          Parlour Cloud data may be processed in countries other than your own, including Australia, the
          United States and the European Union. Where the law requires it, transfers will be covered by
          appropriate safeguards such as standard contractual clauses. Account and service data is kept while
          your account is open. When you close it, we delete it within 30 days, apart from billing records we
          are required by law to keep for longer. You will be able to export your data at any time.
        </p>
        <p>
          We will protect it with encryption in transit and at rest and with limited, logged staff access, and
          if a breach puts your personal information at risk we will tell you and the relevant regulator as
          the law requires.
        </p>
        <p>
          Before Parlour Cloud launches, we will update this page with the specifics: the services, the
          companies involved, and exactly what each one collects. We will ask you to agree to that before
          anything is collected, and if we later change it in a way that matters, we will tell you before the
          change takes effect.
        </p>
      </section>

      <section className="sheet" aria-labelledby="rights-heading">
        <h2 id="rights-heading">Your rights</h2>
        <p>
          Parlour keeps your data on your own devices, so you are in control of it. On the Mac, delete{" "}
          <code>~/.config/parlour</code>, <code>~/Library/Logs/parlour</code> and{" "}
          <code>~/Library/Caches/parlour</code>; on the phone, delete the iOS app; and it is gone. Wherever
          you live, including under the GDPR, the UK GDPR and the Australian Privacy Principles, you may ask
          us what personal information we hold about you, have it corrected, exported or deleted, and object
          to how we use it. Today the honest answer is that we hold none beyond the aggregate site statistics
          above. If you use Parlour Cloud, you will be able to do all of this from your account, or by asking
          us, and you may also complain to your local privacy regulator.
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
