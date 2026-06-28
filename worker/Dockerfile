# Worker image — based on the official Puppeteer image (bundles a matching
# Chrome + all system libs, so headless launches work out of the box).
# Build context = repo ROOT:  docker build -f worker/Dockerfile -t lpb-worker .
FROM ghcr.io/puppeteer/puppeteer:23.11.1

ENV PUPPETEER_SKIP_DOWNLOAD=true
# PUPPETEER_EXECUTABLE_PATH is already set by the base image.

WORKDIR /app
USER root

# Engine deps (puppeteer, sharp, lighthouse) from the repo root.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Engine + template + worker code.
COPY src ./src
COPY templates ./templates
COPY worker ./worker

# Worker-only deps (pg-boss, @supabase/supabase-js).
RUN cd worker && npm install --omit=dev

RUN chown -R pptruser:pptruser /app
USER pptruser

CMD ["node", "worker/index.js"]
