import { Globe, Hand, Keyboard, Layers, Mouse, PawPrint, Shield, Volume2 } from "lucide-react";
import { SettingRow } from "./SettingRow";

/** Read-only reference: how to drive Luma, and what it touches. No controls here. */
export function HelpTab() {
	return (
		<>
			<div className="setting-group-label">Island</div>
			<div className="setting-group">
				<SettingRow icon={Mouse} label="Open and switch panels" desc="Click the island to open it. Scroll or swipe on it, or use the arrows, to move between Calendar, Controls and Pet." />
				<SettingRow icon={Hand} label="Controls panel" desc="Right-click the Wi-Fi or Bluetooth tile for the network and device lists." divider={false} />
			</div>

			<div className="setting-group-label setting-group-label--spaced">Lumi</div>
			<div className="setting-group">
				<SettingRow icon={PawPrint} label="In the island" desc="Click to poke, hold the pointer over it to be stroked, double-click for the Pet panel, drag it out to the desktop." />
				<SettingRow icon={PawPrint} label="On the desktop" desc="Drag to move, double-click to go home, right-click for the quick menu. Drop it on the island to return." divider={false} />
			</div>

			<div className="setting-group-label setting-group-label--spaced">Keyboard</div>
			<div className="setting-group">
				<SettingRow icon={Keyboard} label="Win + 1 to 9" desc="Opens, focuses or minimises the matching pinned dock app. Turn this off in the Dock tab." divider={false} />
			</div>

			<div className="setting-group-label setting-group-label--spaced">What Luma accesses</div>
			<div className="setting-group">
				<SettingRow icon={Volume2} label="Media and audio" desc="Reads the current Windows media session for the music view, and analyses the audio you hear into level bars for the visualizer and for Lumi. Nothing is recorded or sent anywhere." />
				<SettingRow icon={Layers} label="Windows and taskbar" desc="The dock lists your open windows and can replace the native taskbar while Luma runs. The taskbar is restored when Luma quits or restarts." />
				<SettingRow icon={Shield} label="System controls" desc="Volume, brightness, Wi-Fi and Bluetooth are changed through Windows. If Windows or your hardware refuses, the control reports it instead of pretending." />
				<SettingRow icon={Globe} label="Network" desc="Only for weather (Open-Meteo, plus an IP-based location lookup if you haven't chosen a city). Luma has no account, analytics or update server." divider={false} />
			</div>
		</>
	);
}
