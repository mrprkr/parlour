---
"parlour": minor
---

Manage a server from its clients: `/admin` routes and `parlour remote` change the pipeline settings, start, stop and restart the local model and whisper, and run the doctor, logs and restarts. `parlour service` takes one service by name and gains `start`. The model servers are kept from freezing the Mac: a model too big for its memory is not started, they leave cores free and run at a lower priority, and a crash loop backs off and then stops.
