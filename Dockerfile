FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package.json ./
RUN npm install --no-package-lock

FROM deps AS verify
WORKDIR /app

COPY . .

CMD ["npm", "run", "verify"]
