---
"parlour": patch
---

The server keeps running when the microphone stops and opens it again with a backoff, `parlour doctor` says when `audio.inputDevice` is not a device the Mac has, and `parlour service install` and `restart` wait for launchd to let go of a running job before loading it again, so the local model is no longer left unloaded.
