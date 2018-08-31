FROM node:10.9.0-alpine AS builder

ENV NODE_ENV production

COPY . ./build
WORKDIR /build
RUN yarn install --production
RUN ls -A1 | egrep -v "node_modules|index.js|LICENSE|package.json|yarn.lock" | xargs rm -r

FROM node:10.9.0-alpine

ENV NODE_ENV production
COPY --chown=node:node --from=builder /build /home/node/rippled-exporter
RUN ln -s /home/node/rippled-exporter/index.js /usr/local/bin/rippled-exporter
USER node
CMD rippled-exporter
