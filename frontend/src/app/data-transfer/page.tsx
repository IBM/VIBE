'use client';

import React, { useState } from 'react';
import ExportPanel from './ExportPanel';
import ImportPanel from './ImportPanel';
import styles from './page.module.scss';

export default function DataTransferPage() {
	const [activeTab, setActiveTab] = useState(0);

	return (
		<div className={styles.page}>
			<div className={styles.panelHeader}>
				<h2>Data transfer</h2>
			</div>

			<div className={styles.tabButtons} role="tablist" aria-label="Data transfer modes">
				<button
					type="button"
					id="data-transfer-tab-export"
					role="tab"
					aria-selected={activeTab === 0}
					aria-controls="data-transfer-panel-export"
					tabIndex={activeTab === 0 ? 0 : -1}
					className={activeTab === 0 ? styles.activeTabButton : styles.tabButton}
					onClick={() => setActiveTab(0)}
				>
					Export
				</button>
				<button
					type="button"
					id="data-transfer-tab-import"
					role="tab"
					aria-selected={activeTab === 1}
					aria-controls="data-transfer-panel-import"
					tabIndex={activeTab === 1 ? 0 : -1}
					className={activeTab === 1 ? styles.activeTabButton : styles.tabButton}
					onClick={() => setActiveTab(1)}
				>
					Import
				</button>
			</div>

			{activeTab === 0 && <ExportPanel />}
			{activeTab === 1 && <ImportPanel />}
		</div>
	);
}

