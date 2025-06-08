FROM mcr.microsoft.com/vscode/devcontainers/base:0-buster

ENV DENO_INSTALL=/deno

RUN mkdir -p /deno
RUN curl -fsSL https://deno.land/x/install/install.sh | sh

ENV PATH=${DENO_INSTALL}/bin:${PATH}
ENV DENO_DIR=${DENO_INSTALL}/.cache/deno

# Install deno deploy command
RUN deno install -fA jsr:@deno/deployctl --global

# Change owner after all installation steps and package caching are complete
RUN chown -R vscode /deno

# [Optional] Uncomment this section to install additional OS packages.
# RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
#    && apt-get -y install --no-install-recommends <your-package-list-here>
