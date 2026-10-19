# Contributing

Thanks for helping! Bug reports, fixes, translations and ideas are all welcome –
open an issue or a pull request on [rezored/cubicle-crew](https://github.com/rezored/cubicle-crew).

A few house rules (they keep the app small and offline):

- No external assets, CDNs or fonts, no client build step – plain ES modules in `public/`.
- Every new UI string goes into both `T_BG` and `T_EN` in `public/config.js`.
- Code comments are in Bulgarian – match the file you are editing, or write English and we'll translate.
- For visual changes, run the screenshot check from `CLAUDE.md` ("Testing") – `LOGS: none` and
  `EXTERNAL REQUESTS: none`.

## Your own office pet

Everyone with a merged contribution (code, a translation, docs, a bug report with a fix) can have
**one office pet of their own design** – a cat or a dog. It is free in the shop under
**Pets → Contributor pets**, keeps its name, and shows who made it ("by @you") in the shop and
when someone hovers it in the office.

The first one is [Bueno](https://github.com/buensoft) – a tricolour, ticked mix.

### Send it as an idea

Not into pixel code? Open an issue with a photo or a description (colours, markings, ears, tail,
the name) and we'll draw it.

### Or build it yourself

1. **One line in `public/catalog.js`**, next to the other cats or dogs:

   ```js
   I('dog.bueno', 'dog', 0, 'Буено микс', { c: '#eae6de', hi: '#fffdf6', m: '#f2eee6', e: '#2a2624', eye: '#2e1c10',
     ears: 'half', tail: 'plume', len: 2, tall: 1, pat: 'tick', p: '#282420', p2: '#a8773f', by: 'buensoft' }),
   ```

   - id `cat.<name>` or `dog.<name>`, price `0`, `by` = your GitHub username.
   - Use the existing fields – they are listed in the comments above the cats and dogs
     (`c`/`hi` coat and highlight, `m` muzzle, `e` ears, `eye`, `ears`, `tail`, `legs`, `len`,
     `tall`, `pat` + `p`/`p2` for markings).
2. **The name**, in `public/config.js`: `pets.breeds` in both languages (it is the pet's own name and
   can't be changed – people can only add a nickname), and the breed's English name in `T_EN.items`.
3. **Fits the office.** The pet has to look like it belongs: the same size as the other pets
   (`tall: 1` is the most), the muted office palette, a real-looking cat or dog – no text, logos or
   characters from other games and shows.
4. **A new shape is fine**, if the existing fields can't draw it: add *one* small opt-in option to
   `Cat`/`Dog` in `public/characters.js` that changes nothing when it is absent, and show that the other
   breeds didn't move a pixel (e.g. a hash of their canvas in all three poses before and after).
5. **Check it** in `?demo`: walking, sitting and sleeping, next to people, the shop thumbnail, and
   the morning window (`?desktop&wait`) when it is the first pet.
