'use client';

import { Suspense, useState, useEffect } from 'react';
import { useAppData, useTests, useLLMConfigs } from '@/lib/AppDataContext';
import { api, TestSuite } from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { Form, TextArea, NumberInput, Dropdown, Checkbox, Button, InlineLoading, TextInput } from '@carbon/react';
import { parseLLMVariations } from '@/lib/parseLLMResponse';

function GenerateTestsContent() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const { fetchAllData } = useAppData();
	const { llmConfigs, callLLM } = useLLMConfigs();
	const { createTest } = useTests();

	const [testSuites, setTestSuites] = useState<TestSuite[]>([]);
	const [seedInput, setSeedInput] = useState(searchParams.get('seed') ?? '');
	const [description, setDescription] = useState(searchParams.get('description') ?? '');
	const [expectedOutput, setExpectedOutput] = useState(searchParams.get('expectedOutput') ?? '');
	const [selectedLLMConfigId, setSelectedLLMConfigId] = useState<number | null>(null);
	const [count, setCount] = useState(5);
	const PROMPT_TEMPLATE =
		"You are a test generation assistant. Given an example user request: '{{seed}}', produce {{count}} similar variations that trigger the same action. Return a JSON array of strings.";
	const [generated, setGenerated] = useState<Array<{ text: string; selected: boolean }>>([]);
	const [isGenerating, setIsGenerating] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedSuiteId, setSelectedSuiteId] = useState<number | null>(null);

	// Load available test suites
	useEffect(() => {
		api.getTestSuites()
			.then(setTestSuites)
			.catch(() => setTestSuites([]));
	}, []);

	const handleGenerate = async () => {
		if (!seedInput || !selectedLLMConfigId) return;
		setError(null);
		setIsGenerating(true);
		try {
			const filled = PROMPT_TEMPLATE.replace(/{{seed}}/g, seedInput).replace(/{{count}}/g, count.toString());
			const res = await callLLM(selectedLLMConfigId, { prompt: filled });
			const items = parseLLMVariations(res.text);
			setGenerated(items.map((text) => ({ text, selected: true })));
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			setError(msg);
		} finally {
			setIsGenerating(false);
		}
	};

	const handleSave = async () => {
		const toSave = generated.filter((g) => g.selected).map((g) => g.text);
		if (toSave.length === 0) return;
		setIsSaving(true);
		setError(null);
		try {
			for (const text of toSave) {
				const test = await createTest({
					name: text,
					input: text,
					description,
					expected_output: expectedOutput
				});
				if (selectedSuiteId) {
					await api.addSuiteEntry(selectedSuiteId, { test_id: test.id! });
				}
			}
			await fetchAllData();
			router.push('/tests');
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			setError(msg);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div>
			<h1>Generate test variations</h1>
			<Form>
				<TextArea
					id="seed-input"
					labelText="Seed example input"
					placeholder="Enter a user request example..."
					value={seedInput}
					onChange={(e) => setSeedInput(e.currentTarget.value)}
					style={{ marginBottom: '1rem' }}
				/>

				<TextInput
					id="description"
					labelText="Description (applied to all generated tests)"
					placeholder="Enter test description"
					value={description}
					onChange={(e) => setDescription(e.currentTarget.value)}
					style={{ marginBottom: '1rem' }}
				/>

				<TextArea
					id="expected-output"
					labelText="Expected output (applied to all generated tests)"
					placeholder="Enter expected output"
					value={expectedOutput}
					onChange={(e) => setExpectedOutput(e.currentTarget.value)}
					style={{ marginBottom: '1rem' }}
				/>

				<Dropdown
					id="llm-config-select"
					label="LLM config"
					titleText="Select LLM config"
					items={llmConfigs.map((cfg) => ({ id: String(cfg.id), label: cfg.name }))}
					selectedItem={
						selectedLLMConfigId
							? {
									id: String(selectedLLMConfigId),
									label: llmConfigs.find((c) => c.id === selectedLLMConfigId)?.name || ''
								}
							: undefined
					}
					onChange={({ selectedItem }) => {
						if (selectedItem) {
							setSelectedLLMConfigId(Number(selectedItem.id));
						}
					}}
					style={{ marginBottom: '1rem' }}
				/>

				<NumberInput
					id="count-input"
					label="Number of variations"
					value={count}
					min={1}
					max={20}
					onChange={(e) => setCount(Number(e.currentTarget.value))}
					style={{ marginBottom: '1rem' }}
				/>

				<Dropdown
					id="suite-select"
					label="Add to test suite (optional)"
					titleText="Select test suite"
					items={testSuites.map((s) => ({ id: String(s.id), label: s.name }))}
					selectedItem={
						selectedSuiteId
							? {
									id: String(selectedSuiteId),
									label: testSuites.find((s) => s.id === selectedSuiteId)?.name || ''
								}
							: undefined
					}
					onChange={({ selectedItem }) => {
						if (selectedItem) {
							setSelectedSuiteId(Number(selectedItem.id));
						}
					}}
					style={{ marginBottom: '1rem' }}
				/>

				<Button
					kind="primary"
					onClick={handleGenerate}
					disabled={!seedInput || !selectedLLMConfigId || isGenerating}
					style={{ marginBottom: '1rem' }}
				>
					{isGenerating ? 'Generating...' : 'Generate variations'}
				</Button>
			</Form>

			{error && <div style={{ color: 'red', marginTop: '1rem' }}>{error}</div>}
			{isGenerating && <InlineLoading description="Generating..." />}

			{!!generated.length && (
				<div style={{ marginBottom: '2rem' }}>
					<h2>Generated Variations</h2>
					{generated.map((g, i) => (
						<Checkbox
							key={i}
							id={`gen-${i}`}
							labelText={g.text}
							checked={g.selected}
							onChange={() => {
								const arr = [...generated];
								arr[i].selected = !arr[i].selected;
								setGenerated(arr);
							}}
							style={{ display: 'block', marginBottom: '0.5rem' }}
						/>
					))}

					<Button kind="primary" onClick={handleSave} disabled={isSaving} style={{ marginTop: '1rem' }}>
						{isSaving ? 'Saving...' : 'Save selected tests'}
						{isSaving && <InlineLoading description="Saving tests..." />}
					</Button>
				</div>
			)}
		</div>
	);
}

export default function GenerateTestsPage() {
	return (
		<Suspense fallback={null}>
			<GenerateTestsContent />
		</Suspense>
	);
}
