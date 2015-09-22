FROM quarry/monnode
ADD . /srv/app
RUN cd /srv/app && npm install
RUN cd /srv/app && make build
WORKDIR /srv/app
VOLUME /srv/data
ENV VAR1=10
ENV VAR2=20 VAR3=30
ENV VAR4 20
ADD /my/source /src/dest
EXPOSE 80
EXPOSE 9989
VOLUME /srv/data2
RUN cd /srv/app && make build2
ENTRYPOINT node index.js
