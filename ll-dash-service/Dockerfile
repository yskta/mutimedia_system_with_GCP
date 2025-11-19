FROM ubuntu:24.04

# Install dependencies
RUN apt-get update &&\
apt-get install -yq wget

# Install GPAC
RUN mkdir -p /tmp/build && \
    cd /tmp/build && \
    wget https://download.tsi.telecom-paristech.fr/gpac/new_builds/gpac_latest_head_linux64.deb && \
    dpkg -i gpac_latest_head_linux64.deb; apt-get -fy install && \
    rm ./gpac_latest_head_linux64.deb

WORKDIR /server
COPY testvideo.mp4 .
COPY ll_dash/ ll_dash/

# Expose ports
EXPOSE 8080

# Start serving
CMD ["/bin/sh", "-c", "gpac --tfdt_traf flist:srcs=testvideo.mp4:floop=-1 reframer:rt=on -o ll_dash/out.mpd:segdur=6:cdur=0.2:asto=5.8:profile=live:dmode=dynamic @ -o http://0.0.0.0:8080/:rdirs=ll_dash"]

