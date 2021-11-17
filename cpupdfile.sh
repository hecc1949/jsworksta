#!/bin/sh

if [ ! -d /usr/updfiles ]; then
	mkdir /usr/updfiles	
fi

if [ -d /media/udisk/upd ]; then
	echo copy files from u-disk
	for uf in /media/udisk/upd/*
	do
		cp -rf $uf /usr/updfiles/
	done
	sync
fi

if [ -d /media/hcsd/upd ]; then
	echo copy files from sd-card
	for uf in /media/hcsd/upd/*
	do
		cp -rf $uf /usr/updfiles/
	done
	sync
fi

