FROM node:20-slim AS build
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
# --ignore-scripts: the root postinstall builds packages/shared, but only its
# package.json is copied at this point (not tsconfig.json/src yet) — it's built
# explicitly below once full source is present.
RUN npm install --workspaces --include-workspace-root --ignore-scripts

COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w packages/shared && npm run build -w apps/web

FROM nginx:1.27-alpine AS runtime
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
