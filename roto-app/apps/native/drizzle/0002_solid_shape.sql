CREATE TABLE `reference_cache` (
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`kind`, `key`)
);
