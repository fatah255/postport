.PHONY: infra-up infra-down dev build lint typecheck test

infra-up:
	docker compose up -d

infra-down:
	docker compose down

dev:
	pnpm dev

build:
	pnpm build

lint:
	pnpm lint

typecheck:
	pnpm typecheck

test:
	pnpm test
