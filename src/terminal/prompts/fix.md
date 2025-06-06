vYou will refactor all prompts to support the following three new PromptConfig options

- `clearBefore`: (default true) if false, the prompt wont clear the previous things in the terminal befire writing the prompt to the terminal. the current code's functionality is to always clear
- `resetAfter` : (default true): when clearBefore is true and resetAfter is true, anything that was cleared in the terminal is restored after the prompt returns. if it's set to false then no previous content is restores
- `print`

the BasePrompt and PromptConfig should support two options named "clearBefore" and "clearAfter" which are boolean values. When they are true ALL prompts will
