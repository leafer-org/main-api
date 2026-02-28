# Протестируй otp flow


# Media E2E Test Plan

## POST /media/upload-request

- [x] Happy path — valid name, mimeType, bucket → 201 `{ fileId, uploadUrl }`
- [ ] Invalid mimeType format (e.g. `"not-a-mime"`) → ошибка валидации
- [ ] Empty name (`""`) → ошибка валидации (FileName VO rejects empty)
- [ ] Very long name (>255 chars) → ошибка валидации (FileName VO max length)
- [ ] Несуществующий bucket — upload-request создает запись с любым bucket (нет валидации bucket)

## POST /media/confirm-upload

- [ ] Happy path — upload-request → confirm-upload с fileId → 200 `{}`
- [ ] Confirm меняет isTemporary=false в БД (проверить через прямой запрос в PG)
- [ ] Confirm перемещает файл из temp-bucket в основной bucket (S3 copy + delete)
- [ ] Confirm с несуществующим fileId → ошибка FileNotFoundError
- [ ] Confirm уже confirmed файла → ошибка FileAlreadyInUseError
- [ ] Confirm нескольких файлов за раз (массив fileIds)

## GET /media/preview/:mediaId

- [ ] Happy path — temporary файл → 200 `{ url }` (presigned URL на temp bucket)
- [ ] Несуществующий mediaId → 404
- [ ] Non-temporary (confirmed) файл → 404 (preview доступен только для temporary)

## Общая инфраструктура (будущее)

- [ ] Добавить IDP e2e тесты (OTP flow, sessions, profile)
- [ ] Добавить OpenAPI validation middleware для проверки contract compliance
- [ ] Добавить cleanup temporary файлов по TTL (если будет cron/scheduler)
