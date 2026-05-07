import type { ComboChartOptions, BarChartOptions, LineChartOptions, ScatterChartOptions } from '@carbon/charts';

// These match Carbon's semantic colors: blue (interactive), purple (support-04), red (danger), green (success)
export const CHART_COLORS = {
	SUCCESS_RATE: '#0f62fe', // Carbon blue - interactive-01
	SIMILARITY_SCORE: '#8a3ffc', // Carbon purple - support-04
	EXECUTION_TIME: '#da1e28', // Carbon red - support-01/danger
	FAILURES: '#da1e28', // Carbon red - support-01/danger
	SUCCESS: '#24a148' // Carbon green - support-02/success
} as const;

export const baseChartOptions = {
	theme: 'g100' as const,
	toolbar: {
		enabled: false
	}
};

// Combo chart types for performance charts
export const performanceComboChartTypes = [
	{ type: 'line' as const, options: {}, correspondingDatasets: ['Success rate', 'Similarity score'] },
	{ type: 'line' as const, options: {}, correspondingDatasets: ['Execution time'] }
];

// Performance chart color scale
export const performanceColorScale = {
	'Success rate': CHART_COLORS.SUCCESS_RATE,
	'Similarity score': CHART_COLORS.SIMILARITY_SCORE,
	'Execution time': CHART_COLORS.EXECUTION_TIME
};

export const timeChartOptions = {
	title: '',
	axes: {
		bottom: {
			title: 'Date',
			mapsTo: 'key',
			scaleType: 'time' as const
		},
		left: {
			title: 'Percentage / Score (0-100)',
			mapsTo: 'value',
			domain: [0, 100],
			includeZero: true
		},
		right: {
			title: 'Execution time (seconds)',
			mapsTo: 'value',
			correspondingDatasets: ['Execution time'],
			includeZero: true
		}
	},
	comboChartTypes: performanceComboChartTypes,
	legend: {
		enabled: true,
		alignment: 'center'
	},
	curve: 'curveMonotoneX',
	height: '400px',
	...baseChartOptions,
	color: {
		scale: performanceColorScale
	}
} as ComboChartOptions;

export const experimentsChartOptions = {
	title: '',
	axes: {
		bottom: {
			title: 'Experiment',
			mapsTo: 'key',
			scaleType: 'labels' as const
		},
		left: {
			title: 'Percentage / Score (0-100)',
			mapsTo: 'value',
			domain: [0, 100],
			includeZero: true
		},
		right: {
			title: 'Execution time (seconds)',
			mapsTo: 'value',
			correspondingDatasets: ['Execution time'],
			includeZero: true
		}
	},
	comboChartTypes: performanceComboChartTypes,
	legend: {
		enabled: true,
		alignment: 'center'
	},
	curve: 'curveLinear',
	height: '400px',
	...baseChartOptions,
	color: {
		scale: performanceColorScale
	}
} as ComboChartOptions;

export const histogramBarChartOptions = {
	title: '',
	axes: {
		left: {
			title: 'Execution time range (seconds)',
			mapsTo: 'key',
			scaleType: 'labels' as const
		},
		bottom: {
			title: 'Frequency',
			mapsTo: 'value'
		}
	},
	height: '300px',
	...baseChartOptions,
	legend: {
		enabled: false
	}
} as BarChartOptions;

export const recentTrendsChartOptions = {
	title: '',
	axes: {
		bottom: {
			title: 'Recent runs',
			mapsTo: 'key',
			scaleType: 'labels' as const
		},
		left: {
			title: 'Similarity score',
			mapsTo: 'value',
			scaleType: 'linear' as const,
			domain: [0, 100]
		}
	},
	height: '400px',
	curve: 'curveMonotoneX',
	...baseChartOptions,
	legend: {
		enabled: true,
		alignment: 'center'
	}
} as LineChartOptions;

export const failureAnalysisChartOptions = {
	title: '',
	axes: {
		left: {
			title: 'Conversation',
			mapsTo: 'key',
			scaleType: 'labels' as const
		},
		bottom: {
			title: 'Number of failures',
			mapsTo: 'value'
		}
	},
	height: '300px',
	...baseChartOptions,
	color: {
		scale: {
			Failures: CHART_COLORS.FAILURES
		}
	},
	legend: {
		enabled: false
	}
} as BarChartOptions;

export const conversationDifficultyChartOptions = {
	title: '',
	axes: {
		left: {
			title: 'Conversation (hardest first)',
			mapsTo: 'key',
			scaleType: 'labels' as const
		},
		bottom: {
			title: 'Success rate (%)',
			mapsTo: 'value',
			domain: [0, 100]
		}
	},
	height: '300px',
	...baseChartOptions,
	color: {
		scale: {
			'Success rate': CHART_COLORS.SUCCESS
		}
	},
	legend: {
		enabled: false
	}
} as BarChartOptions;

export const successSpeedScatterOptions = {
	title: '',
	axes: {
		bottom: {
			title: 'Average execution time (seconds)',
			mapsTo: 'key',
			scaleType: 'linear' as const
		},
		left: {
			title: 'Average similarity score',
			mapsTo: 'value',
			scaleType: 'linear' as const,
			domain: [0, 100]
		}
	},
	height: '400px',
	points: {
		radius: 6,
		filled: true
	},
	...baseChartOptions,
	legend: {
		enabled: false
	}
} as ScatterChartOptions;
