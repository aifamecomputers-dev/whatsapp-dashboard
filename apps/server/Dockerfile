FROM node:20-slim AS base
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
RUN npm install --workspaces --include-workspace-root

FROM base AS build
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm run build -w packages/shared && npm run build -w apps/server

FROM node:20-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=base /repo/node_modules ./node_modules
COPY --from=base /repo/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /repo/apps/server/dist ./apps/server/dist
COPY --from=build /repo/packages/shared ./packages/shared
COPY apps/server/package.json ./apps/server/package.json
COPY apps/server/src/db/migrations ./apps/server/src/db/migrations

WORKDIR /repo/apps/server
EXPOSE 4000
CMD ["node", "dist/index.js"]
