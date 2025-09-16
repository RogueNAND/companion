import type { ExecuteExpressionResult } from '@companion-app/shared/Expression/ExpressionResult.js'
import {
	ButtonGraphicsDecorationType,
	type ButtonGraphicsDrawBounds,
	type ButtonGraphicsImageDrawElement,
	type ButtonGraphicsImageElement,
	type ButtonGraphicsTextDrawElement,
	type ButtonGraphicsTextElement,
	type ButtonGraphicsCanvasDrawElement,
	type ButtonGraphicsCanvasElement,
	type ExpressionOrValue,
	type SomeButtonGraphicsDrawElement,
	type SomeButtonGraphicsElement,
	type MakeExpressionable,
	type ButtonGraphicsBoxDrawElement,
	type ButtonGraphicsBoxElement,
	type ButtonGraphicsGroupElement,
	type ButtonGraphicsGroupDrawElement,
	type ButtonGraphicsBorderProperties,
	type ButtonGraphicsLineElement,
	type ButtonGraphicsLineDrawElement,
	type ButtonGraphicsCompositeElement,
} from '@companion-app/shared/Model/StyleLayersModel.js'
import { assertNever } from '@companion-app/shared/Util.js'
import { HorizontalAlignment, VerticalAlignment } from '@companion-app/shared/Graphics/Util.js'
import type { CompositeElementDefinition, InstanceDefinitions } from '../Instance/Definitions.js'
import type { CompanionVariableValues } from '@companion-module/base'
import type { VariablesAndExpressionParser } from '../Variables/VariablesAndExpressionParser.js'

class ExpressionHelper {
	readonly #compositeElementStore: InstanceDefinitions
	readonly #parser: VariablesAndExpressionParser

	readonly usedVariables = new Set<string>()
	readonly onlyEnabled: boolean

	constructor(compositeElementStore: InstanceDefinitions, parser: VariablesAndExpressionParser, onlyEnabled: boolean) {
		this.#compositeElementStore = compositeElementStore
		this.#parser = parser
		this.onlyEnabled = onlyEnabled
	}

	resolveCompositeElement(connectionId: string, elementId: string): CompositeElementDefinition | null {
		const definition = this.#compositeElementStore.getCompositeElementDefinition(connectionId, elementId)
		return definition ?? null
	}

	createChildHelper(overrideVariables: CompanionVariableValues): ExpressionHelper {
		const childParser = this.#parser.createChildParser(overrideVariables)
		return new ExpressionHelper(this.#compositeElementStore, childParser, this.onlyEnabled)
	}

	async #executeExpressionAndTrackVariables(
		str: string,
		requiredType: string | undefined
	): Promise<ExecuteExpressionResult> {
		const result = this.#parser.executeExpression(str, requiredType)

		// Track the variables used in the expression, even when it failed
		for (const variable of result.variableIds) {
			this.usedVariables.add(variable)
		}

		return result
	}

	async parseVariablesInString(str: string, defaultValue: string): Promise<string> {
		try {
			const result = this.#parser.parseVariables(str)

			// Track the variables used in the expression, even when it failed
			for (const variable of result.variableIds) {
				this.usedVariables.add(variable)
			}

			return String(result.text)
		} catch (_e) {
			// Ignore errors
			return defaultValue
		}
	}

	async getUnknown(
		value: ExpressionOrValue<boolean | number | string | undefined>,
		defaultValue: boolean | number | string | undefined
	): Promise<boolean | number | string | undefined> {
		if (!value.isExpression) return value.value

		const result = await this.#executeExpressionAndTrackVariables(value.value, undefined)
		if (!result.ok) {
			return defaultValue
		}

		return result.value
	}

	async getNumber(value: ExpressionOrValue<number>, defaultValue: number, scale = 1): Promise<number> {
		if (!value.isExpression) return value.value * scale

		const result = await this.#executeExpressionAndTrackVariables(value.value, 'number')
		if (!result.ok) {
			return defaultValue
		}

		return (result.value as number) * scale
	}

	async getString<T extends string | null | undefined>(value: ExpressionOrValue<T>, defaultValue: T): Promise<T> {
		if (!value.isExpression) return value.value

		const result = await this.#executeExpressionAndTrackVariables(value.value, 'string')
		if (!result.ok) {
			return defaultValue
		}

		return result.value as T
	}

	async getEnum<T extends string>(value: ExpressionOrValue<T>, values: T[], defaultValue: T): Promise<T> {
		if (!value.isExpression) return value.value

		const result = await this.#executeExpressionAndTrackVariables(value.value, 'string')
		if (!result.ok) {
			return defaultValue
		}

		const strValue = result.value as string
		if (!values.includes(strValue as T)) {
			return defaultValue
		}

		return strValue as T
	}

	async getBoolean(value: ExpressionOrValue<boolean>, defaultValue: boolean): Promise<boolean> {
		if (!value.isExpression) return value.value

		const result = await this.#executeExpressionAndTrackVariables(value.value, 'boolean')
		if (!result.ok) {
			return defaultValue
		}

		return result.value as boolean
	}

	async getHorizontalAlignment(value: ExpressionOrValue<HorizontalAlignment>): Promise<HorizontalAlignment> {
		if (!value.isExpression) {
			return this.getEnum<HorizontalAlignment>(value, ['left', 'center', 'right'], 'center')
		}

		const result = await this.#executeExpressionAndTrackVariables(value.value, 'string')
		if (!result.ok) return 'center'

		const firstChar = String(result.value).trim().toLowerCase()[0]
		switch (firstChar) {
			case 'l':
			case 's':
				return 'left'

			case 'r':
			case 'e':
				return 'right'

			default:
				return 'center'
		}
	}
	async getVerticalAlignment(value: ExpressionOrValue<VerticalAlignment>): Promise<VerticalAlignment> {
		if (!value.isExpression) {
			return this.getEnum<VerticalAlignment>(value, ['top', 'center', 'bottom'], 'center')
		}

		const result = await this.#executeExpressionAndTrackVariables(value.value, 'string')
		if (!result.ok) return 'center'

		const firstChar = String(result.value).trim().toLowerCase()[0]
		switch (firstChar) {
			case 't':
			case 's':
				return 'top'

			case 'b':
			case 'e':
				return 'bottom'

			default:
				return 'center'
		}
	}
}

// TODO - this could probably drop all the async, now that this is just run on the backend
export async function ConvertSomeButtonGraphicsElementForDrawing(
	compositeElementStore: InstanceDefinitions,
	elements: SomeButtonGraphicsElement[],
	parser: VariablesAndExpressionParser,
	onlyEnabled: boolean
): Promise<{
	elements: SomeButtonGraphicsDrawElement[]
	usedVariables: Set<string>
}> {
	const helper = new ExpressionHelper(compositeElementStore, parser, onlyEnabled)

	const newElements = await ConvertSomeButtonGraphicsElementForDrawingWithHelper(helper, elements)

	return {
		elements: newElements,
		usedVariables: helper.usedVariables,
	}
}

async function ConvertSomeButtonGraphicsElementForDrawingWithHelper(
	helper: ExpressionHelper,
	elements: SomeButtonGraphicsElement[]
): Promise<SomeButtonGraphicsDrawElement[]> {
	const newElements = await Promise.all(
		elements.map(async (element) => {
			switch (element.type) {
				case 'canvas':
					return convertCanvasElementForDrawing(helper, element)
				case 'group':
					return convertGroupElementForDrawing(helper, element)
				case 'image':
					return convertImageElementForDrawing(helper, element)
				case 'text':
					return convertTextElementForDrawing(helper, element)
				case 'box':
					return convertBoxElementForDrawing(helper, element)
				case 'line':
					return convertLineElementForDrawing(helper, element)
				case 'composite':
					return convertCompositeElementForDrawing(helper, element)
				default:
					assertNever(element)
					return null
			}
		})
	)

	return newElements.filter((element) => element !== null)
}

async function convertCanvasElementForDrawing(
	helper: ExpressionHelper,
	element: ButtonGraphicsCanvasElement
): Promise<ButtonGraphicsCanvasDrawElement> {
	const [decoration] = await Promise.all([
		// helper.getNumber(element.color, 0),
		helper.getEnum(
			element.decoration,
			Object.values(ButtonGraphicsDecorationType),
			ButtonGraphicsDecorationType.FollowDefault
		),
	])

	return {
		id: element.id,
		type: 'canvas',
		usage: element.usage,
		// color,
		decoration,
	}
}

async function convertGroupElementForDrawing(
	helper: ExpressionHelper,
	element: ButtonGraphicsGroupElement
): Promise<ButtonGraphicsGroupDrawElement | null> {
	// Perform enabled check first, to avoid executing expressions when not needed
	const enabled = await helper.getBoolean(element.enabled, true)
	if (!enabled && helper.onlyEnabled) return null

	const [opacity, bounds, children] = await Promise.all([
		helper.getNumber(element.opacity, 1, 0.01),
		convertDrawBounds(helper, element),
		ConvertSomeButtonGraphicsElementForDrawingWithHelper(helper, element.children),
	])

	return {
		id: element.id,
		type: 'group',
		usage: element.usage,
		enabled,
		opacity,
		...bounds,
		children,
	}
}

async function convertCompositeElementForDrawing(
	helper: ExpressionHelper,
	element: ButtonGraphicsCompositeElement
): Promise<ButtonGraphicsGroupDrawElement | null> {
	// Perform enabled check first, to avoid executing expressions when not needed
	const enabled = await helper.getBoolean(element.enabled, true)
	if (!enabled && helper.onlyEnabled) return null

	const [opacity, bounds] = await Promise.all([
		helper.getNumber(element.opacity, 1, 0.01),
		convertDrawBounds(helper, element),
	])

	let children: SomeButtonGraphicsDrawElement[] = []

	const childElement = helper.resolveCompositeElement(element.connectionId, element.elementId)
	if (childElement) {
		// Inject new values
		const propOverrides: CompanionVariableValues = {}
		await Promise.all(
			childElement.options.map(async (option) => {
				const rawValue = element[`opt:${option.id}`]
				if (!rawValue) return

				// TODO - better type handling?
				propOverrides[`$(options:${option.id})`] = await helper.getUnknown(rawValue, undefined)
			})
		)

		const childHelper = helper.createChildHelper(propOverrides)
		children = await ConvertSomeButtonGraphicsElementForDrawingWithHelper(childHelper, childElement.elements)
	}

	return {
		id: element.id,
		type: 'group',
		usage: element.usage,
		enabled,
		opacity,
		...bounds,
		children,
	}
}

async function convertImageElementForDrawing(
	helper: ExpressionHelper,
	element: ButtonGraphicsImageElement
): Promise<ButtonGraphicsImageDrawElement | null> {
	// Perform enabled check first, to avoid executing expressions when not needed
	const enabled = await helper.getBoolean(element.enabled, true)
	if (!enabled && helper.onlyEnabled) return null

	const [opacity, bounds, base64Image, halign, valign, fillMode] = await Promise.all([
		helper.getNumber(element.opacity, 1, 0.01),
		convertDrawBounds(helper, element),
		helper.getString<string | null>(element.base64Image, null),
		helper.getHorizontalAlignment(element.halign),
		helper.getVerticalAlignment(element.valign),
		helper.getEnum(element.fillMode, ['crop', 'fill', 'fit', 'fit_or_shrink'], 'fit_or_shrink'),
	])

	return {
		id: element.id,
		type: 'image',
		usage: element.usage,
		enabled,
		opacity,
		...bounds,
		base64Image,
		halign,
		valign,
		fillMode,
	}
}

async function convertTextElementForDrawing(
	helper: ExpressionHelper,
	element: ButtonGraphicsTextElement
): Promise<ButtonGraphicsTextDrawElement | null> {
	// Perform enabled check first, to avoid executing expressions when not needed
	const enabled = await helper.getBoolean(element.enabled, true)
	if (!enabled && helper.onlyEnabled) return null

	const [opacity, bounds, fontsizeRaw, text, color, halign, valign, outlineColor] = await Promise.all([
		helper.getNumber(element.opacity, 1, 0.01),
		convertDrawBounds(helper, element),
		helper.getUnknown(element.fontsize, 'auto'),
		element.text.isExpression
			? helper.getUnknown(element.text, 'ERR')
			: helper.parseVariablesInString(element.text.value, 'ERR'),
		helper.getNumber(element.color, 0),
		helper.getHorizontalAlignment(element.halign),
		helper.getVerticalAlignment(element.valign),
		helper.getNumber(element.outlineColor, 0),
	])

	const fontsize = Number(fontsizeRaw) || fontsizeRaw

	return {
		id: element.id,
		type: 'text',
		usage: element.usage,
		enabled,
		opacity,
		...bounds,
		text: text + '',
		fontsize: fontsize === 'auto' || typeof fontsize === 'number' ? fontsize : 'auto',
		color,
		halign,
		valign,
		outlineColor,
	}
}

async function convertBoxElementForDrawing(
	helper: ExpressionHelper,
	element: ButtonGraphicsBoxElement
): Promise<ButtonGraphicsBoxDrawElement | null> {
	// Perform enabled check first, to avoid executing expressions when not needed
	const enabled = await helper.getBoolean(element.enabled, true)
	if (!enabled && helper.onlyEnabled) return null

	const [opacity, bounds, color, borderProps] = await Promise.all([
		helper.getNumber(element.opacity, 1, 0.01),
		convertDrawBounds(helper, element),
		helper.getNumber(element.color, 0),
		convertBorderProperties(helper, element),
	])

	return {
		id: element.id,
		type: 'box',
		usage: element.usage,
		enabled,
		opacity,
		...bounds,
		color,
		...borderProps,
	}
}

async function convertLineElementForDrawing(
	helper: ExpressionHelper,
	element: ButtonGraphicsLineElement
): Promise<ButtonGraphicsLineDrawElement | null> {
	// Perform enabled check first, to avoid executing expressions when not needed
	const enabled = await helper.getBoolean(element.enabled, true)
	if (!enabled && helper.onlyEnabled) return null

	const [opacity, fromX, fromY, toX, toY, borderProps] = await Promise.all([
		helper.getNumber(element.opacity, 1, 0.01),
		helper.getNumber(element.fromX, 0),
		helper.getNumber(element.fromY, 0),
		helper.getNumber(element.toX, 100),
		helper.getNumber(element.toY, 100),
		convertBorderProperties(helper, element),
	])

	return {
		id: element.id,
		type: 'line',
		usage: element.usage,
		enabled,
		opacity,
		fromX,
		fromY,
		toX,
		toY,
		...borderProps,
	}
}

async function convertDrawBounds(
	helper: ExpressionHelper,
	element: MakeExpressionable<ButtonGraphicsDrawBounds & { type: string }>
): Promise<ButtonGraphicsDrawBounds> {
	const [x, y, width, height] = await Promise.all([
		helper.getNumber(element.x, 0, 0.01),
		helper.getNumber(element.y, 0, 0.01),
		helper.getNumber(element.width, 1, 0.01),
		helper.getNumber(element.height, 1, 0.01),
	])

	return { x, y, width, height }
}

async function convertBorderProperties(
	helper: ExpressionHelper,
	element: MakeExpressionable<ButtonGraphicsBorderProperties & { type: string }>
): Promise<ButtonGraphicsBorderProperties> {
	const [borderWidth, borderColor, borderPosition] = await Promise.all([
		helper.getNumber(element.borderWidth, 0, 0.01),
		helper.getNumber(element.borderColor, 0),
		helper.getEnum(element.borderPosition, ['inside', 'center', 'outside'], 'inside'),
	])

	return { borderWidth, borderColor, borderPosition }
}
