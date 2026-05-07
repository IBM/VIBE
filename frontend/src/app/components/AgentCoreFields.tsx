import type React from 'react';
import { RadioButton, RadioButtonGroup, TextInput } from '@carbon/react';

interface AgentCoreFieldsProps {
	formData: Record<string, string>;
	onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

export function AgentCoreFields({ formData, onInputChange }: AgentCoreFieldsProps) {
	return (
		<>
			<TextInput
				id="agent-name"
				labelText="Name"
				placeholder="Enter agent name"
				value={formData['agent-name'] || ''}
				onChange={onInputChange}
			/>
			<TextInput
				id="agent-version"
				labelText="Version"
				placeholder="Enter version"
				value={formData['agent-version'] || ''}
				onChange={onInputChange}
			/>

			<RadioButtonGroup
				legendText="Agent type"
				name="agent-type"
				orientation="horizontal"
				valueSelected={formData['agent-type'] || 'crew_ai'}
				onChange={(value) => {
					onInputChange({
						target: { id: 'agent-type', value }
					} as React.ChangeEvent<HTMLInputElement>);
				}}
			>
				<RadioButton id="crew_ai" labelText="CrewAI Agent" value="crew_ai" />
				<RadioButton id="external_api" labelText="External API Agent" value="external_api" />
			</RadioButtonGroup>
		</>
	);
}
