# Worker image (Railway). Based on the official Puppeteer image (bundles a
# matching Chrome + all system libs). Repo root is the build context.
FROM ghcr.io/puppeteer/puppeteer:23.11.1

ENV PUPPETEER_SKIP_DOWNLOAD=true
# PUPPETEER_EXECUTABLE_PATH is already set by the base image.

WORKDIR /app
USER root

# One clean install of all runtime deps (puppeteer, sharp, lighthouse,
# @supabase/supabase-js). netlify-cli is a devDependency and is skipped.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Engine + template + worker code.
COPY src ./src
COPY templates ./templates
COPY worker ./worker

RUN chown -R pptruser:pptruser /app
USER pptruser

CMD ["node", "worker/index.js"]
