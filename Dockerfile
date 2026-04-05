# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

COPY package.json package-lock.json ./

# --ignore-scripts prevents playwright postinstall from re-downloading browsers
# (Chromium is already pre-installed in this image at /ms-playwright)
RUN npm ci --ignore-scripts --prefer-offline --no-audit --no-fund --loglevel=error

COPY . .

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV NG_CACHE_PATH=/tmp/ng-cache

CMD ["npm", "run", "test:ci"]
