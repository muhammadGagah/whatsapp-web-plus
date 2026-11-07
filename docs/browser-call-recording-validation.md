# Browser call recording validation

Automated lifecycle checks run with `node tests/test_call_recording.js`. Menu navigation is covered by `node tests/test_settings_menu.js`.

Test the normal and debug userscripts in Chrome and Edge with NVDA Focus Mode. Open Shift+F8, Record call, then Recording instructions. Verify the submenu label, disabled Stop and Save items before recording, arrow navigation (unavailable items stay reachable and are announced as unavailable), Home, End, Escape and focus return. Activate Start recording without a connected call and confirm NVDA says no call was found in this tab. The browser recording menu must not appear in Companion.

Use a test call whose participants know it will be recorded. Choose Start recording and select the same WhatsApp tab with Share tab audio checked. Confirm that the browser prompt opens from Enter and Space activation. Allow microphone access. Verify that the call remains audible and that the start announcement occurs once. Stop from the menu, then save the file and listen for both voices. The saved file must contain audio only.

Test cancellation in both the tab picker and microphone permission prompt. While either prompt is pending, cancel setup from the menu where the browser allows returning to the page. Grant a late permission and verify that its tracks are stopped without starting a recording. Try another tab, a window, the entire screen, or sharing without audio. No recording should start from those sources.

Disconnect the microphone and stop sharing through the browser. Verify that recording ends, capture indicators turn off, and available audio can be saved. Deny microphone permission and verify that tab sharing stops. Test saving twice, cancelling the discard confirmation, then discarding. A new recording must not overwrite a retained recording.

Use headphones and verify that desktop NVDA output is absent from tab capture. Separately verify that the microphone can still pick up speaker audio and continues recording while WhatsApp itself is muted. Verify that a call opened in the desktop app is not represented as captured browser call audio.

Before saving, try reloading or closing the page and check the browser's leave-page warning. Cancel the navigation and save. Recordings are held in memory and are not recoverable after closing the page. Test automatic stop at the configured memory or duration limit with the unit-test harness.

A live shared-tab track does not prove that a WhatsApp call is still connected, so automatic stop watches the call timer instead. Recording stops after the timer has been missing for three checks five seconds apart. End a call while recording without pressing Stop: within about 20 seconds NVDA must say the call ended and that the recording stopped, and the audio must be available to save. If WhatsApp briefly hides or redraws the call view, a timer that returns within 10 seconds must not stop recording.

References: [Chrome Capture Handle](https://developer.chrome.com/docs/web-platform/capture-handle) and [MDN getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia).

Verify Start is disabled with no call, while ringing, and after hangup. It becomes available with the connected call timer, including picture-in-picture. Keep the menu open during hangup and verify it updates within one second. End the call during tab or microphone selection and confirm setup releases all acquired tracks. Stop and Save must remain usable after hangup. Moving the call to a separate window is not supported for starting a recording in the original tab.

Live DOM inspection on 2026-10-23 confirmed that the connected call exposes `data-testid="voip-call-timer"` with `role="timer"`, and removes it after hangup. Audio recording itself still requires a real recording test.

Test with Voice calls audio enhancement enabled. The separate recorder must still use the original browser microphone capture. While a settings dialog is open, verify that recording feedback remains readable without moving focus. These real audio and NVDA checks remain pending.
