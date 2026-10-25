"""Runs the first iOS `eas build` in interactive mode on CI, answering EAS CLI's prompts.

EAS only creates the Apple distribution certificate interactively. With an App Store
Connect API key in the environment it can do that without an Apple ID login, so this
script plays the part of the person at the keyboard. Later builds run non-interactively.
"""
import os
import sys

import pexpect

KEY_PATH = os.environ["EXPO_ASC_API_KEY_PATH"]
KEY_ID = os.environ["EXPO_ASC_KEY_ID"]
ISSUER_ID = os.environ["EXPO_ASC_ISSUER_ID"]
TEAM_ID = os.environ["EXPO_APPLE_TEAM_ID"]
DOWN = "\x1b[B"

# (pattern, keys to send). A prompt is live while it shows "›" (answered ones show "…"),
# so patterns require it. When several match, the one earliest in the output wins.
ACTIVE = r"[^\n]*›"
ANSWERS = [
    (r"Apple ID:" + ACTIVE, None),  # would need a password and 2FA: stop instead
    (r"Would you like to try again\?" + ACTIVE, None),  # something failed: stop so the log shows why
    (r"Generate a new App Store Connect API Key\?" + ACTIVE, "n"),
    (r"Path to App Store Connect API Key:" + ACTIVE, KEY_PATH + "\r"),
    (r"Key ID:" + ACTIVE, KEY_ID + "\r"),
    (r"Issuer ID" + ACTIVE, ISSUER_ID + "\r"),
    (r"Apple Team ID:" + ACTIVE, TEAM_ID + "\r"),
    (r"set up Push Notifications" + ACTIVE, DOWN + "\r"),  # "No": the push key needs an Apple ID session
    (r"What is the next build number\?" + ACTIVE, "1\r"),
    (r"Do you want to log in to your Apple account\?" + ACTIVE, "y"),
    (r"›[^\n]*\((Y/n|y/N)\)", "\r"),  # any other yes/no: take the default
    (r"›[^\n]*Use arrow-keys", "\r"),  # any other list: take the first (recommended) choice
]

cmd = os.environ.get("EAS_CMD") or "npx eas-cli@latest build --platform ios --profile {} --auto-submit".format(sys.argv[1] if len(sys.argv) > 1 else "playtest")
print("$", cmd, flush=True)
# EAS switches to non-interactive mode whenever CI is set, as it is on GitHub Actions.
env = {k: v for k, v in os.environ.items() if k not in ("CI", "GITHUB_ACTIONS")}
child = pexpect.spawn(cmd, encoding="utf-8", timeout=3600, dimensions=(50, 200), env=env)
child.logfile_read = sys.stdout
patterns = [p for p, _ in ANSWERS] + [pexpect.EOF]
while True:
    i = child.expect(patterns)
    if i == len(ANSWERS):
        break
    keys = ANSWERS[i][1]
    if keys is None:
        print("\n::error::Stopped at an EAS prompt this script must not answer: " + ANSWERS[i][0], flush=True)
        child.terminate(force=True)
        sys.exit(1)
    child.send(keys)
    # Skip the prompt's redraws up to and including its answered line, so they are not matched again.
    child.expect([r"[✔✖][^\n]*\n", pexpect.TIMEOUT], timeout=15)
child.close()
sys.exit(child.exitstatus or 0)
