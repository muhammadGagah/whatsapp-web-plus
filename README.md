# WhatsApp Web Plus

WhatsApp Web Plus is an open-source browser userscript designed to optimize the WhatsApp Web interface. It is built specifically to improve usability for visually impaired individuals using screen readers (such as NVDA, JAWS, Narrator, or VoiceOver), while also providing robust privacy controls for all users.

The script streamlines keyboard navigation, removes repetitive speech announcements, and safeguards sensitive information from being displayed on-screen or read aloud in public environments.

---

## Key Features

### Screen Reader Optimization
* **Announcement Filtering:** Automatically filters out repetitive background aria-labels and descriptive text (such as "For more options press...") to reduce screen reader clutter.
* **Semantic Message Structure:** Re-aligns messages, sender names, status icons, and timestamps so screen readers speak them in a logical and easy-to-follow sequence.
* **Descriptive Icon Labels:** Converts raw icon names into natural spoken descriptions (e.g., announcing "voice message" instead of technical asset identifiers).

### Smart Privacy Shield (Privacy Mode)
* **On-Demand Obfuscation:** Instantly blurs and hides contact names, chat details, and phone numbers.
* **Anti-Voice Leak:** Replaces phone numbers with generic placeholders like "Participant" to prevent screen readers from speaking private numbers out loud.
* **Persistence:** Saves your privacy preferences locally so they remain active across browser reloads.

### Enhanced Navigation
* Allows quick focus redirection to input fields, search boxes, and active chat lists, preventing screen reader focus traps.

---

## Keyboard Shortcuts Cheat Sheet

### Navigation Shortcuts
Use these combinations (**Alt + Shift + Key**) to jump to different sections of the WhatsApp Web interface:

| Shortcut | Description |
| :--- | :--- |
| Alt + Shift + 1 | Navigate directly to the Chats tab |
| Alt + Shift + 2 | Navigate to the Status / Updates tab |
| Alt + Shift + 3 | Navigate to the Communities tab |
| Alt + Shift + 4 | Navigate to the Channels tab |
| Alt + Shift + 5 | Navigate to Meta AI |
| Alt + Shift + D | Direct focus to the Message Input Box |
| Alt + Shift + N | Toggle Privacy Shield (Blur & Hide Info) ON or OFF |

### Quick Action Shortcuts
Use these combinations (**Alt + Key**) to perform quick actions:

| Shortcut | Description |
| :--- | :--- |
| Alt + 1 | Direct focus to the Chat List |
| Alt + 2 | Direct focus to the Last Message in the active conversation |
| Alt + 3 | Jump to the first Unread Message in the active conversation |
| Alt + 0 | Close the active WhatsApp Audio Player |
| Alt + T | Announce the current active chat header |

---

## Installation Guide

Follow these steps to install and start using WhatsApp Web Plus:

1. **Install a Userscript Manager:**
   * Download and install a compatible userscript manager extension for your web browser. We recommend [Tampermonkey](https://www.tampermonkey.net/), which is available for Chrome, Firefox, Safari, Edge, and Brave.
2. **Add the Script:**
   * Open your userscript manager and select "Create a new script".
   * Copy the entire code content of [whatsapp_web_plus.user.js](whatsapp_web_plus.user.js).
   * Paste it into the editor of your userscript manager and save the script (Ctrl + S or Command + S).
3. **Run WhatsApp Web:**
   * Navigate to [web.whatsapp.com](https://web.whatsapp.com). The script will run automatically. You will notice immediate layout and accessibility improvements.

---

## Contributing

Contributions are highly welcome and appreciated! Whether you want to fix a bug, suggest a new feature, or improve accessibility, you are encouraged to join in.

### How to Contribute
1. Fork this repository to your own GitHub account.
2. Clone your forked repository to your local machine.
3. Create a new branch for your feature or bug fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. Write clean code and ensure your changes comply with accessibility guidelines.
5. Verify your changes pass all verification checks (see the Testing section below).
6. Commit your changes and push them to your fork:
   ```bash
   git commit -m "Add descriptive message about your changes"
   git push origin feature/your-feature-name
   ```
7. Open a Pull Request on this repository.

If you encounter any bugs, please open an Issue describing the problem, how to reproduce it, and any screen reader behavior you observed.

---

## Testing (For Developers)

The project includes built-in verification scripts to test filter rules, shortcut handling, and runtime DOM configurations. These require [Node.js](https://nodejs.org/) to run.

To execute the verification suite, run the following commands in your terminal:

```bash
# Test privacy filter and number obfuscation logic
node test_privacy_filter.js

# Test accessibility runtime behavior and keyboard shortcuts
node test_accessibility_runtime.js
```

A successful test run will finish with no errors and output confirmation messages.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for the full text.
