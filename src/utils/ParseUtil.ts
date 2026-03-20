import { ParsedXmlElement, ParseToken } from '../types/index';

/**
 * Validates if the input string is a valid XML format
 *
 * This function validates XML through the following steps:
 * 1. Check if the input is a non-empty string
 * 2. Validate the basic XML structure (whether there's a root element)
 * 3. Check if start tags and end tags match
 * 4. Handle special XML structures such as CDATA, comments, etc.
 *
 * @param xml - XML string to be validated
 * @returns true if the input is valid XML format, otherwise false
 *
 * @example
 * ```ts
 * const validXml = '<root><child /></root>';
 * const invalidXml = '<root><child></root>';
 * console.log(checkXML(validXml)); // true
 * console.log(checkXML(invalidXml)); // false
 * ```
 */
export function checkXML(xml: string): boolean {
	if (!xml || typeof xml !== 'string') {
		return false;
	}

	// Remove leading and trailing whitespace
	xml = xml.trim();

	// Check if starts with XML declaration (optional)
	// Check if starts with a tag
	if (!xml.startsWith('<')) {
		return false;
	}

	try {
		// Create a DOM parser to validate XML
		// In Node.js environment, we don't have DOMParser, so use regex validation
		// Check basic XML structure

		// Match XML declaration (optional)
		let xmlContent: string = xml;
		const xmlDeclarationMatch: RegExpMatchArray | null =
			xmlContent.match(/^<\?xml[^>]*\?>/i);
		if (xmlDeclarationMatch) {
			xmlContent = xmlContent
				.substring(xmlDeclarationMatch[0].length)
				.trim();
		}

		// Check if there's a root element
		if (!/^<[^>]+>/.test(xmlContent)) {
			return false;
		}

		// Count start and end tags, excluding CDATA, comments and XML declarations
		const startTags: string[] = (
			xmlContent.match(/<[^>/!?][^>]*>/g) || []
		).filter(
			tag =>
				!tag.startsWith('</') &&
				!tag.startsWith('<!--') &&
				!tag.startsWith('<![CDATA[') &&
				!tag.startsWith('<!') &&
				!tag.startsWith('<?')
		);
		const endTags: RegExpMatchArray | [] =
			xmlContent.match(/<\/[^>]+>/g) || [];

		// If the number of start and end tags don't match, it's not valid XML
		if (startTags.length < endTags.length) {
			return false;
		}

		// Check if tags are properly closed
		const tagStack: string[] = [];

		// Use a more precise regex to split XML into tags and text content
		const tokens: string[] = xmlContent
			.split(/(<!\[CDATA\[.*?\]\]>|<!--.*?-->|<[^>]+>)/g)
			.filter(token => token.trim() !== '');

		for (let i = 0; i < tokens.length; i++) {
			if (!tokens[i]) continue;
			const token: string = tokens[i]!;

			// Skip CDATA and comments
			if (token.startsWith('<![CDATA[') && token.endsWith(']]>')) {
				continue; // Ignore CDATA content
			}

			if (token.startsWith('<!--') && token.endsWith('-->')) {
				continue; // Ignore comments
			}

			if (token.startsWith('</')) {
				// End tag
				const tagName: string | undefined = token
					.substring(2, token.length - 1)
					.trim()
					.split(/\s+/)[0];
				if (tagStack.length === 0) {
					return false; // No corresponding start tag
				}
				const lastTag: string | undefined = tagStack.pop();
				if (lastTag !== tagName) {
					return false; // Tag mismatch
				}
			} else if (token.startsWith('<') && !token.endsWith('/>')) {
				// Start tag (non-self-closing)
				const tagNameMatch: RegExpMatchArray | null =
					token.match(/^<([^\s/>]+)/);
				if (!tagNameMatch || !tagNameMatch[1]) {
					return false; // Invalid tag
				}
				if (tagNameMatch && tagNameMatch[1]) {
					const tagName: string = tagNameMatch[1]!;
					tagStack.push(tagName);
				}
			}
		}

		// If there are still unclosed tags, it's not valid XML
		if (tagStack.length > 0) {
			return false;
		}

		return true;
	} catch {
		// If there's an error during parsing, it's not valid XML
		return false;
	}
}

/**
 * Parses BPMN XML string to JSON object
 *
 * This function is specifically designed to parse BPMN format XML, extracting content starting from <bpmn:definitions,
 * and converting it to a structured JSON object. The parsing process handles tags, attributes, text content,
 * while skipping special structures like CDATA and comments.
 *
 * @param xml - BPMN XML string to be parsed
 * @returns Parsed JSON object, returns null if parsing fails
 * @throws Error - Throws error when XML is empty or doesn't contain bpmn:definitions tag
 *
 * @example
 * ```ts
 * const xmlString = '<bpmn:definitions>...</bpmn:definitions>';
 * const parsedJson = parseXMLToJSON(xmlString);
 * console.log(parsedJson);
 * ```
 */
export function parseXMLToJSON(xml: string): ParsedXmlElement | null {
	if (!xml || typeof xml !== 'string' || !xml.trim()) {
		throw new Error('XML must be a non-empty string');
	}

	// Find the position where <bpmn:definitions starts
	const definitionsStartIndex: number = xml.indexOf('<bpmn:definitions');
	if (definitionsStartIndex === -1) {
		throw new Error('Could not find <bpmn:definitions tag in XML');
	}

	// Extract XML content starting from <bpmn:definitions
	const relevantXml: string = xml.substring(definitionsStartIndex);

	// Parse XML to JSON object
	const stack: ParsedXmlElement[] = [];
	let result: ParsedXmlElement | null = null;

	// Reconstruct regex to handle the entire XML
	const allTokens: ParseToken[] = [];
	let tokenMatch: RegExpMatchArray | null;

	const cdataRegex: RegExp = /<!\[CDATA\[([\s\S]*?)\]\]>/g;

	// Process CDATA sections, skipping them from the processing flow
	let processedXml: string = relevantXml;
	let cdataMatch: RegExpExecArray | null;
	while ((cdataMatch = cdataRegex.exec(relevantXml)) !== null) {
		// Skip CDATA part, don't add to tokens
		const cdataStart: number = cdataMatch.index;
		const cdataEnd: number = cdataMatch.index + cdataMatch[0].length;
		processedXml =
			relevantXml.substring(0, cdataStart) +
			relevantXml.substring(cdataEnd);
	}

	const newTokenRegex: RegExp = /(<([^>]+)>)|([^<]+)/g;
	while ((tokenMatch = newTokenRegex.exec(processedXml)) !== null) {
		if (tokenMatch[1]) {
			// Tag
			allTokens.push({ type: 'tag', value: tokenMatch[1] });
		} else if (tokenMatch[3]) {
			// Text content
			const trimmedText: string = tokenMatch[3].trim();
			if (trimmedText) {
				allTokens.push({ type: 'text', value: trimmedText });
			}
		}
	}

	for (let i = 0; i < allTokens.length; i++) {
		if (!allTokens[i]) continue;
		const token: ParseToken = allTokens[i]!;
		if (!token) continue;
		if (token.type === 'tag') {
			const tagContent: string = token.value;

			// Check if it's a comment
			if (tagContent.startsWith('<!--')) {
				continue; // Skip comments
			}

			// Check if it's an end tag
			if (tagContent.startsWith('</')) {
				const closingElement: ParsedXmlElement | undefined =
					stack.pop();
				if (!closingElement) continue;
				if (stack.length === 0) {
					// This is the root node we're looking for, complete parsing
					result = closingElement;
					break;
				}
			}
			// Check if it's a self-closing tag
			else if (tagContent.endsWith('/>')) {
				const element: ParsedXmlElement = parseXmlElement(tagContent);

				if (stack.length > 0) {
					const parent: ParsedXmlElement = stack[stack.length - 1]!;
					const parentKey: string = Object.keys(parent)[0]!;
					if (parent && parent[parentKey]) {
						if (!parent[parentKey].children) {
							parent[parentKey].children = [];
						}
						parent[parentKey].children.push(element);
					}
				} else {
					// If it's a self-closing tag at root level
					stack.push(element);
				}
			}
			// Start tag
			else {
				const element: ParsedXmlElement = parseXmlElement(tagContent);

				if (stack.length === 0) {
					// Root element
					stack.push(element);
				} else {
					// Child element
					const parent: ParsedXmlElement = stack[stack.length - 1]!;
					const parentKey: string = Object.keys(parent)[0]!;
					if (parent && parent[parentKey]) {
						if (!parent[parentKey].children) {
							parent[parentKey].children = [];
						}
						parent[parentKey].children.push(element);
					}
					stack.push(element);
				}
			}
		} else if (token.type === 'text' && stack.length > 0) {
			// Process text content
			const parent: ParsedXmlElement = stack[stack.length - 1]!;
			const parentKey: string = Object.keys(parent)[0]!;
			if (parent && parent[parentKey]) {
				if (!parent[parentKey].content) {
					parent[parentKey].content = '';
				} else {
					parent[parentKey].content += ' ';
				}
				parent[parentKey].content += token.value;
			}
		}
	}
	return result;
}
/**
 * Parses the tag and attributes of a single XML element
 *
 * This function parses an XML tag string into an object containing tag name, attributes and content.
 * It extracts the tag name, parses all attributes, and handles the bpmn: prefix.
 *
 * @param tag - XML tag string, such as '<bpmn:task id="task1" name="My Task"/>'
 * @returns Parsed element object containing ID as key, as well as tag name and attribute information
 * @throws Error - Throws error when unable to parse the tag name
 */
function parseXmlElement(tag: string): ParsedXmlElement {
	// Remove < and > symbols
	const content: string = tag.replace(/^<|>\/?$/g, '');

	// Extract tag name
	const tagNameMatch: RegExpMatchArray | null = content.match(/^([^\s/>]+)/);
	if (!tagNameMatch) {
		throw new Error(`Unable to parse tag: ${tag}`);
	}

	let tagName: string | undefined = tagNameMatch[1];
	if (!tagName) {
		throw new Error(`Unable to parse tag: ${tag}`);
	}
	// If tag name starts with bpmn:, remove bpmn: prefix
	if (tagName.startsWith('bpmn:')) {
		tagName = tagName.substring(5);
	}

	// Parse attributes
	const properties: Record<string, string> = {};
	let id: string = '';
	const attrRegex: RegExp = /(\w+(?::\w+)?)\s*=\s*["']([^"']*)["']/g;
	let attrMatch: RegExpExecArray | null;

	while ((attrMatch = attrRegex.exec(content)) !== null) {
		if (attrMatch.length < 3) continue;
		const attrName: string = attrMatch[1]!;
		const attrValue: string = attrMatch[2]!;
		if (attrName && attrValue) {
			// If attribute name starts with bpmn:, remove bpmn: prefix
			const normalizedAttrName: string = attrName.startsWith('bpmn:')
				? attrName.substring(5)
				: attrName;
			properties[normalizedAttrName] = attrValue;
			if (normalizedAttrName === 'id') {
				id = attrValue;
			}
		}
	}
	if (!id) id = tagName;

	return {
		[id]: {
			tagName,
			properties,
		},
	};
}
