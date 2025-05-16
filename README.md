![](https://img.shields.io/badge/Foundry-v12-informational)
![Latest Release Download Count](https://img.shields.io/github/downloads/mhilbrunner/tokenprofile/latest/module.zip)
![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Ftokenprofile&colorB=4aa94a)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# Token Profile

![Token Profile module header image](.github/header.png)

A [FoundryVTT](https://foundryvtt.com/) module for creating actor 'profiles' that can be displayed as tooltips (on token mouse hover) or in chat.

## Features

Supports multiple profiles and multiple paragraphs per profile, with easy switching and ordering. Each profile can be quickly enabled or disabled, with either the first or a randomized profile being shown depending on settings.

Each paragraph has separate visibility settings and can be shown depending on token ownership level, vision of the viewing player/token, [Tagger](https://foundryvtt.com/packages/tagger) tags, [Perceptive](https://foundryvtt.com/packages/perceptive) vision layers and if that isn't enough, there are some [hooks](https://foundryvtt.wiki/en/development/api/hooks) for macro or module extensibility.

Optionally, [GM Notes](https://foundryvtt.com/packages/gm-notes/) can be shown in tooltips for GMs as well.

## Use case examples

- Allow players to set up profiles with physical descriptions of their characters and maybe an image as reminder for the others. Especially useful in text only games.
- Jot down some GM only notes on actors that you can easily reference with mouseover. Roleplaying or plot reminders? Combat turn-by-turn plan for the boss?
- Playing in a futuristic game where people broadcast profile information? Hello, Chummer. Create profiles with 'AR' tags, for example, and have them at your player's augmented fingertips.
- Have actors setup as merchants, vendors or vending machines? [Item Piles](https://foundryvtt.com/packages/item-piles) is great for that. And now, those can have advert blurb tooltips too! Or a quick info of what they have to offer, current sales, whatever you can be bothered to put into the profiles. If you set the token to a transparent image, you can probably even create some environmental tooltips.

## Alternatives

Token Profile was born out of the need to keep multiple notes (e.g. player vs. GM) on actors, display them as tooltips and post them to chat, and have fine-grained permissions on them. (This description should be visible to everyone, this one to everyone with this Tagger tag, and this one only to the GM.)

If your needs are less complex or you want something simpler, consider these:

- [GM Notes](https://foundryvtt.com/packages/gm-notes/) can similarly attach notes to actors – and other documents, like items. Token Profile has an option to display GM Note notes for actors to GMs.
- [Illandril's Token Tooltips](https://foundryvtt.com/packages/illandril-token-tooltips) displays tooltips for tokens, focusing on stats and data, like HP or attributes.
- [Token Note Hover](https://foundryvtt.com/packages/token-note-hover) is similar to the above in some ways, but also to Token Profile: it integrates with systems and can display things like biographies or notes if the systems offer those. However, that also somewhats limits the notes down to what the system offers.
- [Visual Active Effects](https://foundryvtt.com/packages/visual-active-effects) is super useful to have a "buff bar" for Active Effects. Combined with a macro to attach a freeform effect with some name to a token, this can be enough to quickly jot down a line or two and attach it to a token, if that is all thats needed.
- Also, some systems already feature (more or less extensive) note fields. And there's always journals.

## Credits

This module takes heavy inspiration from various MMO roleplaying flag addons and the Foundry modules mentioned above. Those are great modules, check them out!

## Installation

Use Foundry's packager manager or use this URL with its install from manifest URL feature:

<https://github.com/mhilbrunner/tokenprofile/releases/latest/download/module.json>

If you want to install a specific release, browse the available versions for links to version-specific `module.json` files:

<https://github.com/mhilbrunner/tokenprofile/releases>

## Caveats

Keep in mind all data is stored in actor [flags](https://foundryvtt.wiki/en/development/api/flags). Maybe don't write the next Lord of the Rings trilogy in a profile and then make tons of copies of that actor. Or do it, who am I to judge.

## License

The code is licensed under the terms of the MIT license, see [LICENSE](LICENSE).
Regarding Foundry, this is a work under the Limited License Agreement for Package Development, as outlined [here](https://foundryvtt.com/article/license/).
