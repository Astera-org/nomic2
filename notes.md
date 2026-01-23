Can you make a slack plugin that runs in vercel and has the following commands:

/nomic new <text of proposal>
/nomic yes
/nomic no
/nomic reveal

This plugin keeps track of its state per channel.

new: 
Clears the nomic state. Emmits the text of the proposal to the whole channel

yes/no: marks the submitter as voting yes or no. Only to the submitter does it say:
You voted YES or NO on:
<text of proposal>
X votes so far

To the rest of the channel it says "1 vote"

reveal:
Prints the list of each submitter and which way they voted and the yes no tally at the end




