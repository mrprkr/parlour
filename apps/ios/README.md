# Parlour for iOS

A client, in the same sense a satellite is a client: it records, it posts, it
plays the answer back. Everything that thinks, holds a key or touches the house
runs on the Mac at home. What the phone adds is that it is the one you already
carry, it knows about HomeKit without asking anybody, and it has a small model
of its own for when the house cannot be reached.

## Running it

The Xcode project is generated from `project.yml` rather than checked in,
because a `.pbxproj` is not a thing a person can review.

```sh
brew install xcodegen
pnpm exec nx run ios:app          # generate the project and open it
pnpm exec nx run ios:generate     # just generate it
```

Signing is left to you: set `PARLOUR_DEVELOPMENT_TEAM` in your environment
before generating, or pick a team in Xcode once. HomeKit and the local network
both need a real device, and the app icon slot is empty until someone draws one.

There is no iOS job in CI. The repository's CI runs on a macOS runner but
without Xcode's simulators or `xcodegen`, so the app is built by hand for now:

```sh
pnpm exec nx run ios:xcodebuild   # compile for the simulator
pnpm exec nx run ios:xcodetest    # run ParlourTests
```

## What it asks for, and why

Every string is in `Parlour/Resources/Info.plist`, and the Settings tab lists
the first four with a mark against each, so nothing is asked for out of sight.
The camera is asked for only when a pairing code is scanned.

| Permission | What it buys | Raised by |
| --- | --- | --- |
| Microphone | Recording while the talk button is held | Holding the button |
| Local network | Finding the server with Bonjour, then talking to it | Opening the app |
| HomeKit | The rooms and accessories on the House tab | Opening that tab |
| Speech recognition | Making out a request on the phone when the server cannot be reached | Only when the on-device answer is switched on |
| Camera | Scanning the pairing code `parlour pair` shows | Tapping Scan pairing code |

HomeKit and multicast are entitlements as well as prompts, in
`Parlour/Resources/Parlour.entitlements`. Plain HTTP to the house is allowed by
`NSAllowsLocalNetworking`, which is scoped to the local network and nothing
else, because the server is on a private address and speaks HTTP.

## How it finds the server

The same way a satellite does: it browses for `_parlour._tcp`, and because
Bonjour hands back a service rather than an address, it opens a connection to
the service and reads the host and port off the resolved path. Anything it
finds is offered in Settings; typing an address in wins over anything found,
and the address the app keeps is the only server it talks to.

## Pairing

`parlour pair` on the Mac draws a QR code holding one link,
`parlour://pair?url=...&token=...&name=...`. Settings has Scan pairing code,
which reads it with VisionKit's scanner; the Camera app reads it too, and
opens the app through the `parlour` URL scheme in `Info.plist`. A link that
arrives that way is only taken once the person has confirmed the server it
names, since any web page can open one. Either way the
address and the token are taken together (`Core/PairingLink.swift`), the token
goes to the keychain as if it were typed, and Settings checks the server
straight away. The desktop app shows the same code under On the network.

## The model on the phone

`Features/Intelligence` wraps Apple's Foundation Models, available from iOS 26
on a phone with Apple Intelligence switched on. It is off by default and it is
a fallback, not a first stop: it has no tools, so it cannot switch anything on,
read a sensor or look anything up. When it is on and the server cannot be
reached, the recording is transcribed on the device and answered on the device,
and the answer is labelled as coming from the phone rather than from home.

## The design system

`Parlour/DesignSystem/Tokens.swift` is generated from `packages/design`, which
is also where the site's, the menu bar app's and the phone page's stylesheets
come from. Do not edit it; edit `packages/design/src/tokens.ts` and run
`pnpm exec nx run design:emit`. `Theme.swift` and `Components.swift` are the
hand-written layer over it, and they are the only files allowed to name a
colour or a font.
