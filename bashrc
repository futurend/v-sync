# hide cursor and prompt
# clear screen
# launch vidcomm

if [ -n "$SSH_CLIENT" ]; then
    tput cnorm
else
    # hide cursor
    tput civis
    # show cursor
    #tput cnorm

    # clear screen
    clear

    # autorun vidcomm
    cd ~/v-sync
    node v-sync.js
fi
