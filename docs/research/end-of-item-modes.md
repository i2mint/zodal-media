# What a media player does when an item ends: modes, critiques, terms and icons

Research for `@zodal/media/end-mode`, 2026-11-25. Standard depth: platform APIs, five consumer players, one desktop player, and the published critiques.

## Summary and recommendation

Every mainstream player answers "what happens when this item ends?" with **two controls**: a **Repeat** button that cycles *off → all → one* (or *off → one → all*) and a **Shuffle** toggle, plus, in streaming apps, an **Autoplay** switch that continues past the end of the list with recommendations [1][2][3][4]. The platform APIs encode exactly that pair: Android's `REPEAT_MODE_NONE/ONE/ALL` plus a shuffle flag [5][6], Apple's `MPRepeatType.off/one/all` plus `MPShuffleType.off/items/collections` [7][8]. The web's Media Session API has neither, so a browser player cannot show its mode on a lock screen [9].

The critiques converge on four problems:

1. **The cycling repeat button hides its state.** The only difference between "repeat all" and "repeat one" is a tiny "1" on the icon, and users cannot tell them apart [10][11]; a three-state toggle is "combobox territory" [12]; KDE's Elisa fixed its confusion by adding tooltips and a checked state [13]. Toggle research in general says the state must not rest on colour or a small glyph alone [14][15].
2. **"Repeat one" resets, or does not, by surprise.** Plexamp and VLC reset it on a track change and users file bugs either way [16][17]; Apple Music users report it not sticking [4].
3. **"Shuffle" is not what people mean by random.** True random (Fisher–Yates over the list, or a fresh draw each time) clusters and repeats; Spotify replaced it in 2014 with an even spread [18] and in 2025 made "Fewer Repeats" the default [19][20]. foobar2000's own FAQ steers users from "Random" (any track, repeats allowed) to "Shuffle (tracks)" (each once) [21].
4. **Autoplay plays what the person did not choose.** Spotify, YouTube Music and Apple Music continue past the list with recommendations, and the most common complaint is how to stop it [22][23][24]; Apple Podcasts' "Continuous Playback" switch is reported to turn itself back on [25]. Pocket Casts' Autoplay is the well-behaved case: it continues only *from the list the episode was started from* (a podcast or a filter), in that list's order, and only when the Up Next queue is empty [26][27].

"Stop after this one" is missing from most consumer players (Apple Music users make a one-song playlist to get it [4]); it is a built-in command in foobar2000 ("Stop after current") [21] and the reason the sleep-timer option "end of track" exists [1].

**Recommendation** (adopted in `./end-mode`):

- **One mode with five named values**, chosen from a menu, rather than a cycling repeat button plus a shuffle toggle: *Stop after this one*, *Repeat this one*, *Play the list in order* (default), *Repeat the list*, *Shuffle the list*. foobar2000's single "Playback order" menu is the precedent [21]; the cost is that "shuffle and stop at the end" is not offered (shuffle is endless), which no source shows anyone asking for.
- **The control always shows its word beside its icon** ("Repeat 1", "Shuffle"), so no state depends on a small glyph or a colour.
- **The set is the play context**: the list, filter or playlist the item was started from, as Pocket Casts does [26], never the whole library and never recommendations.
- **Shuffle is a shuffle**: each item once per round, a new round never starting with the item that just ended.
- **Standard icons**: Material Symbols `repeat`, `repeat_one`, `shuffle`, `playlist_play` [28]; Lucide `repeat`, `repeat-1`, `shuffle`, `list-video` [29]. Stop-after has no standard icon; `keyboard_tab` / `arrow-right-to-line` ("→|", play to the line and stop) is used here.
- **Words**: "Repeat", "Repeat one/all" and "Shuffle" are the platforms' own terms [5][7] and stay; "Autoplay" is avoided because users read it as "plays things I did not pick" [22][23].

## 1. The classic behaviours

| Player | Controls for the end of an item | Notes |
|---|---|---|
| Android (Media3 / MediaSession) | Repeat: off, one, all; shuffle on/off | Media3's `RepeatButton` cycles off → one → all by default [6]; "repeat none" stops at the end of the list [5]. |
| Apple (MediaPlayer, Apple Music) | Repeat: off, one ("Repeat Song"), all; shuffle off, items, collections; Autoplay (∞) | Repeat and Shuffle are in the Up Next screen; they are greyed out while Autoplay is on [4][7][8]. |
| Spotify | Repeat: off, all, one; Shuffle (Standard / Fewer Repeats); Smart Shuffle; Autoplay | Repeat moved in and out of menus across versions [10][19]. |
| YouTube Music | Repeat, Shuffle, Autoplay at the bottom of Up Next | Autoplay continues with recommendations after the queue [23]. |
| Pocket Casts | Up Next queue; Autoplay from the list started from | No repeat at all [26][27]. |
| Apple Podcasts | Continuous Playback switch | Reported to re-enable itself [25]. |
| foobar2000 | One "Playback order" menu (Default, Repeat (playlist), Repeat (track), Random, Shuffle (tracks/albums/folders)); "Stop after current" | The single-menu model [21]. |
| VLC | Repeat one / all, random | Repeat-one defaults and resets are recurring bugs [17]. |

## 2. Critiques, in detail

- **Unreadable state.** A MacRumors thread: the user went off → on → on → off and could not see the difference between the two "on" states except a small "1" [11]. Spotify users report the cycle changing (all → one → off, then all → off only) between versions [10]. The Banshee design list: "three or more is combobox territory" [12]. Elisa (KDE) bug 436217 "Repeat modes are a bit confusing" was fixed by tooltips naming the mode and a checked state [13]. NN/g on toggles: use a clear, conventional state indication, not an ambiguous label or colour alone [14]; the 2023 JUX study of toggle confusion reaches the same conclusion [15].
- **Repeat one persistence.** Plexamp resets repeat-one on a track change "by design, as most players do", and users object [16]; VLC iOS defaulted to repeat one by surprise [17]. Here: the mode is the listener's preference and never resets by itself.
- **Random versus shuffle.** Spotify, 2014: users complained the same artist came up together; a fair random order does that, so Spotify spread them out [18]. Spotify, 2025: "Fewer Repeats" penalises recently played tracks early in the order and is the Premium default [19][20]. foobar2000 FAQ: "Random" repeats, "Shuffle (tracks)" plays each once [21]. Here: a shuffle bag (each once per round), which is the property people mean by "not random enough".
- **Autoplay.** Spotify's community threads on stopping unsolicited music [22]; YouTube Music's Autoplay switch at the bottom of the queue [23]; Apple Music's Autoplay disabling Repeat and Shuffle [4]. Here: nothing outside the set ever plays.
- **What "the set" is.** Pocket Casts defines it exactly: the list the episode was started from, in its current sort order [26]. Its forums show the cost of a hidden rule (anything left in Up Next silently blocks Autoplay) [27]. Here: the set is named on screen ("Up next · All: …").

## 3. Terms and icons

| Mode | Platform terms | Material Symbols | Lucide | Here: label / word |
|---|---|---|---|---|
| Stop | repeat off / none [5][7]; "Stop after current" [21] | `keyboard_tab` (no standard) | `arrow-right-to-line` | Stop after this one / Then stop (a bare "Stop" under a pause button reads as a command) |
| Repeat one | `REPEAT_MODE_ONE`, `MPRepeatType.one`, "Repeat Song" | `repeat_one` | `repeat-1` | Repeat this one / Repeat 1 |
| In order | repeat off, shuffle off; "Continuous Playback", "Autoplay" (Pocket Casts) | `playlist_play` | `list-video` | Play the list in order / In order |
| Repeat all | `REPEAT_MODE_ALL`, `MPRepeatType.all`, "Repeat All" | `repeat` | `repeat` | Repeat the list / Repeat all |
| Shuffle | shuffle on, `MPShuffleType.items`, "Shuffle (tracks)" | `shuffle` | `shuffle` | Shuffle the list / Shuffle |

Material Symbols also has `repeat_on`, `repeat_one_on` and `shuffle_on` (filled-background variants for the active state) [28]; they are not needed when the word is always shown.

## Gaps

- No controlled usability study of repeat/shuffle controls was found; the critiques are bug reports, forum threads and design-list opinion [10]–[13][16][17].
- The Media Session API's lack of repeat and shuffle was read from the spec's action list [9]; no open W3C issue was found.

## REFERENCES

[1] [Spotify Newsroom: sleep timer, and the upgraded queue with Shuffle, Smart Shuffle, Repeat and Sleep Timer](https://newsroom.spotify.com/tag/sleep-timer)
[2] [YouTube Music shuffle and repeat changes — 9to5Google, 2025-07-11](https://9to5google.com/2025/07/11/youtube-music-shuffle-repeat/)
[3] [Repeat Button — Android Media3 Compose Material3 reference](https://developer.android.com/reference/kotlin/androidx/media3/ui/compose/material3/buttons/RepeatButton.composable)
[4] [How to shuffle and repeat music on your iPhone or Android — Apple Support](https://support.apple.com/HT207230)
[5] [MediaSessionCompat (repeat and shuffle modes) — Android Developers](https://developer.android.com/reference/android/support/v4/media/session/MediaSessionCompat)
[6] [RepeatButton (Media3 Compose) — Android Developers](https://developer.android.com/reference/kotlin/androidx/media3/ui/compose/buttons/RepeatButton.composable)
[7] [MPRepeatType — Apple Developer Documentation](https://developer.apple.com/documentation/mediaplayer/mprepeattype)
[8] [MPShuffleType — Apple Developer Documentation](https://developer.apple.com/documentation/mediaplayer/mpshuffletype)
[9] [Media Session — W3C Working Draft](https://w3c.github.io/mediasession/)
[10] [Repeat button moved from now playing screen — Spotify Community](https://community.spotify.com/t5/Android/Repeat-button-moved-from-now-playing-screen/td-p/4553781)
[11] [How do you repeat a single song? — MacRumors Forums](https://forums.macrumors.com/threads/how-do-you-repeat-a-single-song.2012612)
[12] [The Shuffle/Repeat UI — Banshee mailing list, 2008-02](https://lists.gnome.org/archives/banshee-list/2008-February/msg00150.html)
[13] [Bug 436217 — Repeat modes are a bit confusing (Elisa) — KDE Bugzilla](https://bugs.kde.org/show_bug.cgi?id=436217)
[14] [Toggle-Switch Guidelines — Nielsen Norman Group](https://www.nngroup.com/articles/toggle-switch-guidelines/)
[15] [Al-Jasim and Murano, toggle switch usability — Journal of User Experience, August 2023](https://uxpajournal.org/wp-content/uploads/sites/7/2023/08/JUX_Al-Jasim_Aug_2023.pdf)
[16] [Plexamp shouldn't reset repeat one track on track change — Plex Forum](https://forums.plex.tv/t/plexamp-shouldnt-reset-repeat-one-track-on-track-change/934819)
[17] [Audio player always defaults to Repeat One — VLC iOS issue 1701](https://code.videolan.org/videolan/vlc-ios/-/issues/1701)
[18] [How to shuffle songs? — Spotify Engineering, 2014-02-28](https://engineering.atspotify.com/2014/02/how-to-shuffle-songs)
[19] [Shuffle: Making Random Feel More Human — Spotify Engineering, 2025-11](https://engineering.atspotify.com/2025/11/shuffle-making-random-feel-more-human)
[20] [Shuffle update: fewer repeats — Spotify Newsroom, 2025-11-13](https://newsroom.spotify.com/2025-11-13/shuffle-update-fewer-repeats/)
[21] [Random versus Shuffle (tracks), and Stop after current — Hydrogenaudio forum, quoting the foobar2000 FAQ](https://hydrogenaudio.org/index.php/topic,117249.0.html)
[22] [How to Stop AutoPlay — Spotify Community](https://community.spotify.com/t5/Content-Questions/How-to-Stop-AutoPlay/m-p/5242984)
[23] [This One Setting Could Be Ruining Your YouTube Music Playlists — BGR](https://www.bgr.com/2238236/youtube-music-playlist-settings-disable-autoplay/)
[24] [Apple Music automatically adds extra albums to Continue Playing — Apple Community](https://discussions-jp-prz.apple.com/thread/256208131)
[25] [Podcast queue still starting new podcast even though continuous playback is off — Apple Community](https://discussions.apple.com/thread/255774639)
[26] [Autoplay — Pocket Casts Support](https://support.pocketcasts.com/knowledge-base/autoplay/) and [Introducing Autoplay — Pocket Casts blog, 2023-07-25](https://blog.pocketcasts.com/2023/07/25/introducing-autoplay/)
[27] [Autoplay stopped working — Pocket Casts Forums](https://forums.pocketcasts.com/forums/topic/autoplay-stopped-working/page/2)
[28] [repeat_one, repeat, shuffle_on — Material Symbols (via Composables icon index)](https://composables.com/icons/icon-libraries/material-symbols/repeat_one)
[29] [repeat-1 — Lucide](https://lucide.dev/icons/repeat-1), [repeat](https://lucide.dev/icons/repeat), [repeat-off](https://lucide.dev/icons/repeat-off)
