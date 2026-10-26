import { Power, Clock, BatteryWarning, RefreshCw, RotateCcw, LogOut } from "lucide-react";
import { SettingRow } from "./SettingRow";

interface GeneralTabProps {
	autostart: boolean;
	toggleAutostart: () => void;
	timeFormat24h: boolean;
	toggleTimeFormat24h: () => void;
	lowBatteryThreshold: number;
	handleThresholdChange: (val: number) => void;
	restartLuma: () => void;
	resetToDefaults: () => void;
	quitLuma: () => void;
}

export function GeneralTab({
	autostart,
	toggleAutostart,
	timeFormat24h,
	toggleTimeFormat24h,
	lowBatteryThreshold,
	handleThresholdChange,
	restartLuma,
	resetToDefaults,
	quitLuma
}: GeneralTabProps) {
	return (
		<>
			<div className="setting-group-label">System</div>
			<div className="setting-group">
				<SettingRow icon={Power} label="Launch at Login" desc="Open Luma automatically">
					<label className="toggle-switch">
						<input type="checkbox" checked={autostart} onChange={toggleAutostart} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow icon={Clock} label="24-Hour Time" desc="Use 24-hour clock format">
					<label className="toggle-switch">
						<input type="checkbox" checked={timeFormat24h} onChange={toggleTimeFormat24h} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow
					icon={BatteryWarning}
					label="Low Battery Alert"
					desc={`Trigger at ${lowBatteryThreshold}%`}
					divider={false}
				>
					<input
						type="range"
						min="5"
						max="50"
						step="5"
						value={lowBatteryThreshold}
						onChange={(e) => handleThresholdChange(parseInt(e.target.value))}
						className="settings-slider"
					/>
				</SettingRow>
			</div>

			<div className="setting-group-label">App</div>
			<div className="setting-group">
				<SettingRow
					icon={RotateCcw}
					label="Reset to Defaults"
					desc="Restore all settings and restart Luma"
					action
					danger
					onClick={resetToDefaults}
				/>
				<SettingRow
					icon={RefreshCw}
					label="Restart Luma"
					desc="Reinitialize all components"
					action
					onClick={restartLuma}
				/>
				<SettingRow
					icon={LogOut}
					label="Quit Luma"
					desc="Exit application completely"
					action
					danger
					onClick={quitLuma}
					divider={false}
				/>
			</div>
		</>
	);
}
