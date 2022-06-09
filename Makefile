COMPOSEFLAGS=-d
ITESTS_L2_HOST=http://localhost:9545

build: build-go build-ts
.PHONY: build

build-go: submodules op-node op-proposer op-batcher
.PHONY: build-go

build-ts: submodules
	yarn build
.PHONY: build-ts

submodules:
	# CI will checkout submodules on its own (and fails on these commands)
	if [ -z "$$GITHUB_ENV" ]; then \
		git submodule init; \
		git submodule update; \
	fi
.PHONY: submodules

op-bindings:
	make -C ./op-bindings
.PHONY: op-bindings

op-node:
	make -C ./op-node op-node
.PHONY: op-node

op-batcher:
	make -C ./op-batcher op-batcher
.PHONY: op-batcher

op-proposer:
	make -C ./op-proposer op-proposer
.PHONY: op-proposer

mod-tidy:
	cd ./op-node && go mod tidy && cd .. && \
	cd ./op-proposer && go mod tidy && cd ..  && \
	cd ./op-batcher && go mod tidy && cd ..  && \
	cd ./op-bindings && go mod tidy && cd ..  && \
	cd ./op-e2e && go mod tidy && cd ..
.PHONY: mod-tidy

clean:
	rm -rf ./bin
.PHONY: clean

devnet-up:
	@bash ./ops-bedrock/devnet-up.sh
.PHONY: devnet-up

devnet-down:
	@(cd ./ops-bedrock && GENESIS_TIMESTAMP=$(shell date +%s) docker-compose stop)
.PHONY: devnet-down

devnet-clean:
	rm -rf ./packages/contracts-bedrock/deployments/devnetL1
	rm -rf ./.devnet
	cd ./ops-bedrock && docker-compose down
	docker image ls 'ops-bedrock*' --format='{{.Repository}}' | xargs docker rmi
	docker volume ls --filter name=ops-bedrock --format='{{.Name}}' | xargs docker volume rm

.PHONY: devnet-clean

test-unit:
	make -C ./op-node test
	make -C ./op-proposer test
	make -C ./op-batcher test
	make -C ./op-e2e test
	yarn test
.PHONY: test-unit

test-integration:
	bash ./ops-bedrock/test-integration.sh \
		./packages/contracts-bedrock/deployments/devnetL1
.PHONY: test-integration

lint:
	make -C op-bindings lint
	make -C op-proposer lint
	make -C op-node lint
	make -C op-e2e lint
	make -C op-batcher lint
.PHONY: lint
