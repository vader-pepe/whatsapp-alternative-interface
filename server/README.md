## Endpoint

**POST** `/send`

### Content Types

* `application/json` for text/status messages.
* `multipart/form-data` for media messages.

### Fields

| Field             | Type   | Required?   | Description                                                                 |
| ----------------- | ------ | ----------- | --------------------------------------------------------------------------- |
| `type`            | string | **Yes**     | One of: `text`, `image`, `video`, `sticker`, `audio`, `document`, `status`. |
| `to`              | string | No\*        | Target JID or phone number. Optional if `allContacts` is true or `status`.  |
| `text`            | string | Conditional | Message or text-based status.                                               |
| `caption`         | string | No          | Caption for media.                                                          |
| `filename`        | string | No          | File name for documents.                                                    |
| `ptt`             | string | No          | Send audio as PTT (`true`/`false`).                                         |
| `allContacts`     | string | No          | `true` to send to all contacts.                                             |
| `statusType`      | string | Conditional | For `status` messages: `text`, `image`, `video`, `audio`.                   |
| `backgroundColor` | string | Conditional | For text statuses.                                                          |
| `font`            | string | Conditional | For text statuses.                                                          |
| `statusJidList`   | string | No          | JSON array of JIDs for statuses.                                            |
| `file`            | binary | Conditional | Media upload for non-text messages.                                         |

> **Media messages** require `multipart/form-data` and `file`.

## Examples

## 1. Send Text Message

```bash
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -d '{
    "type": "text",
    "to": "628123456789",
    "text": "Hello from Baileys!"
  }'
```

## 2. Send Image

```bash
curl -X POST http://localhost:3000/send \
  -F type=image \
  -F to=628123456789 \
  -F caption="Check out this photo" \
  -F file=@/path/to/image.jpg
```

## 3. Send Video

```bash
curl -X POST http://localhost:3000/send \
  -F type=video \
  -F to=628123456789 \
  -F caption="Watch this" \
  -F file=@/path/to/video.mp4
```

## 4. Send Sticker

```bash
curl -X POST http://localhost:3000/send \
  -F type=sticker \
  -F to=628123456789 \
  -F file=@/path/to/sticker.webp
```

## 5. Send Audio (Voice Note)

```bash
curl -X POST http://localhost:3000/send \
  -F type=audio \
  -F to=628123456789 \
  -F ptt=true \
  -F file=@/path/to/audio.ogg
```

## 6. Send Document

```bash
curl -X POST http://localhost:3000/send \
  -F type=document \
  -F to=628123456789 \
  -F filename="report.pdf" \
  -F file=@/path/to/document.pdf
```

## 7. Post Text Status

```bash
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -d '{
    "type": "status",
    "statusType": "text",
    "text": "Good morning!",
    "backgroundColor": "#00FF00",
    "font": "1",
    "allContacts": "true"
  }'
```

## 8. Post Image Status

```bash
curl -X POST http://localhost:3000/send \
  -F type=status \
  -F statusType=image \
  -F caption="New Day!" \
  -F allContacts=true \
  -F file=@/path/to/photo.jpg
```

## 9. Send Text to All Contacts

```bash
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -d '{
    "type": "text",
    "text": "Hello everyone!",
    "allContacts": "true"
  }'
```

## 10. Send Text to All Contacts

```bash
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -d '{
    "type": "text",
    "to": "628123456789",
    "text": "This is a reply message",
    "quoted": {
      "key": {
        "remoteJid": "628123456789@s.whatsapp.net",
        "fromMe": false,
        "id": "ABCD123456"
      }
    }
  }'
```

## Fixes in Route

* Fixed early `return` inside loops.
* Awaited `getAllContactJids()` for contact loading.
* Safe font parsing to number.
* Deferred file deletion until after all sends.
* Added explicit sticker handling.

## Recommendations

* Add authentication.
* Validate file size/type.
* Use async file deletion.
* Batch large broadcasts.

## License

MIT
