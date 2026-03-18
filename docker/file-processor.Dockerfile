FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /app

CMD ["sh", "-c", "yarn build && yarn serve:file-processor"]
