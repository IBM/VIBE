'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Button, UnorderedList, ListItem, Stack } from '@carbon/react';
import { Idea, ArrowRight, Checkmark } from '@carbon/icons-react';

interface WalkthroughStep {
	title: string;
	content: React.ReactNode;
}

const WALKTHROUGH_STEPS: WalkthroughStep[] = [
	{
		title: 'Welcome to templates',
		content: (
			<>
				<p style={{ marginBottom: '1rem' }}>
					Templates define how VIBE communicates with AI services. This quick guide will help you understand
					how they work.
				</p>
				<p>
					<strong>You&apos;ll learn about:</strong>
				</p>
				<UnorderedList>
					<ListItem>Request templates - formatting API requests</ListItem>
					<ListItem>Response maps - extracting AI responses</ListItem>
					<ListItem>Capabilities - matching templates to conversations</ListItem>
				</UnorderedList>
			</>
		)
	},
	{
		title: 'Request templates',
		content: (
			<>
				<p style={{ marginBottom: '1rem' }}>
					<strong>Request templates</strong> format your messages into API-compatible JSON.
				</p>
				<p style={{ marginBottom: '1rem' }}>Use placeholders to inject content:</p>
				<UnorderedList style={{ marginBottom: '1rem' }}>
					<ListItem>
						<code>{'{{input}}'}</code> - the current user message
					</ListItem>
					<ListItem>
						<code>{'{{conversation_history}}'}</code> - full chat history
					</ListItem>
				</UnorderedList>
				<pre
					style={{
						background: '#f4f4f4',
						padding: '1rem',
						borderRadius: '4px',
						fontSize: '12px'
					}}
				>
					{`{
  "model": "gpt-4",
  "messages": [
    {"role": "user", "content": "{{input}}"}
  ]
}`}
				</pre>
			</>
		)
	},
	{
		title: 'Response maps',
		content: (
			<>
				<p style={{ marginBottom: '1rem' }}>
					<strong>Response maps</strong> tell VIBE how to extract the AI&apos;s reply from the API response.
				</p>
				<p style={{ marginBottom: '1rem' }}>Use dot notation to specify the path:</p>
				<pre
					style={{
						background: '#f4f4f4',
						padding: '1rem',
						borderRadius: '4px',
						fontSize: '12px',
						marginBottom: '1rem'
					}}
				>
					{`{
  "output": "choices.0.message.content"
}`}
				</pre>
				<p>
					This extracts <code>response.choices[0].message.content</code> from the API response.
				</p>
			</>
		)
	},
	{
		title: 'Capabilities',
		content: (
			<>
				<p style={{ marginBottom: '1rem' }}>
					<strong>Capabilities</strong> are tags that match templates to conversations.
				</p>
				<p style={{ marginBottom: '1rem' }}>When a conversation requires a capability:</p>
				<UnorderedList style={{ marginBottom: '1rem' }}>
					<ListItem>Only agents with matching templates can run it</ListItem>
					<ListItem>This ensures the API format is correct</ListItem>
					<ListItem>
						Example: <code>openai-chat</code>, <code>ollama-generate</code>
					</ListItem>
				</UnorderedList>
				<p>
					Templates are <strong>shared</strong> - create once, use in many agents!
				</p>
			</>
		)
	}
];

const STORAGE_KEY = 'vibe-template-walkthrough-seen';

interface TemplateWalkthroughProps {
	/** Force show the walkthrough (for testing) */
	forceShow?: boolean;
}

/**
 * First-time walkthrough for the template/capability system.
 * Shows automatically on first visit, can be dismissed.
 */
export function TemplateWalkthrough({ forceShow = false }: TemplateWalkthroughProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [currentStep, setCurrentStep] = useState(0);

	useEffect(() => {
		if (forceShow) {
			setIsOpen(true);
			return;
		}

		const hasSeenWalkthrough = localStorage.getItem(STORAGE_KEY);
		if (!hasSeenWalkthrough) {
			setIsOpen(true);
		}
	}, [forceShow]);

	const handleClose = () => {
		localStorage.setItem(STORAGE_KEY, 'true');
		setIsOpen(false);
		setCurrentStep(0);
	};

	const handleNext = () => {
		if (currentStep < WALKTHROUGH_STEPS.length - 1) {
			setCurrentStep((prev) => prev + 1);
		} else {
			handleClose();
		}
	};

	const handlePrevious = () => {
		if (currentStep > 0) {
			setCurrentStep((prev) => prev - 1);
		}
	};

	const isLastStep = currentStep === WALKTHROUGH_STEPS.length - 1;
	const step = WALKTHROUGH_STEPS[currentStep];

	return (
		<Modal open={isOpen} onRequestClose={handleClose} modalHeading={step.title} passiveModal={false} size="md">
			<Stack gap={5}>
				<div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
					{WALKTHROUGH_STEPS.map((_, index) => (
						<div
							key={index}
							style={{
								width: '8px',
								height: '8px',
								borderRadius: '50%',
								backgroundColor: index === currentStep ? '#0f62fe' : '#e0e0e0',
								transition: 'background-color 0.2s'
							}}
						/>
					))}
				</div>

				{/* Step content */}
				<div style={{ minHeight: '200px' }}>{step.content}</div>

				{/* Navigation buttons */}
				<div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
					<Button kind="ghost" onClick={handleClose}>
						Skip tutorial
					</Button>
					<div style={{ display: 'flex', gap: '0.5rem' }}>
						{currentStep > 0 && (
							<Button kind="secondary" onClick={handlePrevious}>
								Previous
							</Button>
						)}
						<Button kind="primary" onClick={handleNext} renderIcon={isLastStep ? Checkmark : ArrowRight}>
							{isLastStep ? 'Got it!' : 'Next'}
						</Button>
					</div>
				</div>
			</Stack>
		</Modal>
	);
}

/**
 * Button to manually trigger the walkthrough.
 */
export function WalkthroughTrigger() {
	const [showWalkthrough, setShowWalkthrough] = useState(false);

	const handleClick = () => {
		// Temporarily remove the storage key to show walkthrough
		localStorage.removeItem(STORAGE_KEY);
		setShowWalkthrough(true);
	};

	return (
		<>
			<Button kind="ghost" size="sm" renderIcon={Idea} onClick={handleClick}>
				Learn about templates
			</Button>
			{showWalkthrough && <TemplateWalkthrough forceShow />}
		</>
	);
}
