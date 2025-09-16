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

	readonly #usedVariables: Set<string>
	readonly onlyEnabled: boolean

	constructor(
		compositeElementStore: InstanceDefinitions,
		parser: VariablesAndExpressionParser,
		onlyEnabled: boolean,
		usedVariables: Set<string>
	) {
		this.#compositeElementStore = compositeElementStore
		this.#parser = parser
		this.#usedVariables = usedVariables
		this.onlyEnabled = onlyEnabled
	}

	resolveCompositeElement(connectionId: string, elementId: string): CompositeElementDefinition | null {
		const definition = this.#compositeElementStore.getCompositeElementDefinition(connectionId, elementId)
		return definition ?? null
	}

	createChildHelper(overrideVariables: CompanionVariableValues): ExpressionHelper {
		const childParser = this.#parser.createChildParser(overrideVariables)
		return new ExpressionHelper(this.#compositeElementStore, childParser, this.onlyEnabled, this.#usedVariables)
	}

	#executeExpressionAndTrackVariables(str: string, requiredType: string | undefined): ExecuteExpressionResult {
		const result = this.#parser.executeExpression(str, requiredType)

		// Track the variables used in the expression, even when it failed
		for (const variable of result.variableIds) {
			this.#usedVariables.add(variable)
		}

		return result
	}

	parseVariablesInString(str: string, defaultValue: string): string {
		try {
			const result = this.#parser.parseVariables(str)

			// Track the variables used in the expression, even when it failed
			for (const variable of result.variableIds) {
				this.#usedVariables.add(variable)
			}

			return String(result.text)
		} catch (_e) {
			// Ignore errors
			return defaultValue
		}
	}

	getUnknown(
		value: ExpressionOrValue<boolean | number | string | undefined>,
		defaultValue: boolean | number | string | undefined
	): boolean | number | string | undefined {
		if (!value.isExpression) return value.value

		const result = this.#executeExpressionAndTrackVariables(value.value, undefined)
		if (!result.ok) {
			return defaultValue
		}

		return result.value
	}

	getNumber(value: ExpressionOrValue<number>, defaultValue: number, scale = 1): number {
		if (!value.isExpression) return value.value * scale

		const result = this.#executeExpressionAndTrackVariables(value.value, 'number')
		if (!result.ok) {
			return defaultValue
		}

		return (result.value as number) * scale
	}

	getString<T extends string | null | undefined>(value: ExpressionOrValue<T>, defaultValue: T): T {
		if (!value.isExpression) return value.value

		const result = this.#executeExpressionAndTrackVariables(value.value, 'string')
		if (!result.ok) {
			return defaultValue
		}

		return result.value as T
	}

	getEnum<T extends string>(value: ExpressionOrValue<T>, values: T[], defaultValue: T): T {
		if (!value.isExpression) return value.value

		const result = this.#executeExpressionAndTrackVariables(value.value, 'string')
		if (!result.ok) {
			return defaultValue
		}

		const strValue = result.value as string
		if (!values.includes(strValue as T)) {
			return defaultValue
		}

		return strValue as T
	}

	getBoolean(value: ExpressionOrValue<boolean>, defaultValue: boolean): boolean {
		if (!value.isExpression) return value.value

		const result = this.#executeExpressionAndTrackVariables(value.value, 'boolean')
		if (!result.ok) {
			return defaultValue
		}

		return result.value as boolean
	}

	getHorizontalAlignment(value: ExpressionOrValue<HorizontalAlignment>): HorizontalAlignment {
		if (!value.isExpression) {
			return this.getEnum<HorizontalAlignment>(value, ['left', 'center', 'right'], 'center')
		}

		const result = this.#executeExpressionAndTrackVariables(value.value, 'string')
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
	getVerticalAlignment(value: ExpressionOrValue<VerticalAlignment>): VerticalAlignment {
		if (!value.isExpression) {
			return this.getEnum<VerticalAlignment>(value, ['top', 'center', 'bottom'], 'center')
		}

		const result = this.#executeExpressionAndTrackVariables(value.value, 'string')
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

export function ConvertSomeButtonGraphicsElementForDrawing(
	compositeElementStore: InstanceDefinitions,
	elements: SomeButtonGraphicsElement[],
	parser: VariablesAndExpressionParser,
	onlyEnabled: boolean
): {
	elements: SomeButtonGraphicsDrawElement[]
	usedVariables: Set<string>
} {
	const usedVariables = new Set<string>()
	const helper = new ExpressionHelper(compositeElementStore, parser, onlyEnabled, usedVariables)

	const newElements = ConvertSomeButtonGraphicsElementForDrawingWithHelper(helper, elements)

	return {
		elements: newElements,
		usedVariables: usedVariables,
	}
}

function ConvertSomeButtonGraphicsElementForDrawingWithHelper(
	helper: ExpressionHelper,
	elements: SomeButtonGraphicsElement[]
): SomeButtonGraphicsDrawElement[] {
	const newElements = elements.map((element) => {
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

	return newElements.filter((element) => element !== null)
}

function convertCanvasElementForDrawing(
	helper: ExpressionHelper,
	element: ButtonGraphicsCanvasElement
): ButtonGraphicsCanvasDrawElement {
	const decoration = helper.getEnum(
		element.decoration,
		Object.values(ButtonGraphicsDecorationType),
		ButtonGraphicsDecorationType.FollowDefault
	)

	return {
		id: element.id,
		type: 'canvas',
		usage: element.usage,
		// color,
		decoration,
	}
}

function convertGroupElementForDrawing(
	helper: ExpressionHelper,
	element: ButtonGraphicsGroupElement
): ButtonGraphicsGroupDrawElement | null {
	// Perform enabled check first, to avoid executing expressions when not needed
	const enabled = helper.getBoolean(element.enabled, true)
	if (!enabled && helper.onlyEnabled) return null

	const opacity = helper.getNumber(element.opacity, 1, 0.01)
	const bounds = convertDrawBounds(helper, element)
	const children = ConvertSomeButtonGraphicsElementForDrawingWithHelper(helper, element.children)

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

function convertCompositeElementForDrawing(
	helper: ExpressionHelper,
	element: ButtonGraphicsCompositeElement
): ButtonGraphicsGroupDrawElement | null {
	// Perform enabled check first, to avoid executing expressions when not needed
	const enabled = helper.getBoolean(element.enabled, true)
	if (!enabled && helper.onlyEnabled) return null

	const opacity = helper.getNumber(element.opacity, 1, 0.01)
	const bounds = convertDrawBounds(helper, element)

	let children: SomeButtonGraphicsDrawElement[] = []

	const childElement = helper.resolveCompositeElement(element.connectionId, element.elementId)
	if (childElement) {
		// Inject new values
		const propOverrides: CompanionVariableValues = {}

		for (const option of childElement.options) {
			const rawValue = element[`opt:${option.id}`]
			if (!rawValue) continue

			// TODO - better type handling?
			propOverrides[`$(options:${option.id})`] = helper.getUnknown(rawValue, undefined)
		}

		const childHelper = helper.createChildHelper(propOverrides)
		children = ConvertSomeButtonGraphicsElementForDrawingWithHelper(childHelper, childElement.elements)
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

function convertImageElementForDrawing(
	helper: ExpressionHelper,
	element: ButtonGraphicsImageElement
): ButtonGraphicsImageDrawElement | null {
	// Perform enabled check first, to avoid executing expressions when not needed
	const enabled = helper.getBoolean(element.enabled, true)
	if (!enabled && helper.onlyEnabled) return null

	const opacity = helper.getNumber(element.opacity, 1, 0.01)
	const bounds = convertDrawBounds(helper, element)
	const base64Image = helper.getString<string | null>(element.base64Image, null)
	const halign = helper.getHorizontalAlignment(element.halign)
	const valign = helper.getVerticalAlignment(element.valign)
	const fillMode = helper.getEnum(element.fillMode, ['crop', 'fill', 'fit', 'fit_or_shrink'], 'fit_or_shrink')

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

function convertTextElementForDrawing(
	helper: ExpressionHelper,
	element: ButtonGraphicsTextElement
): ButtonGraphicsTextDrawElement | null {
	// Perform enabled check first, to avoid executing expressions when not needed
	const enabled = helper.getBoolean(element.enabled, true)
	if (!enabled && helper.onlyEnabled) return null

	const opacity = helper.getNumber(element.opacity, 1, 0.01)
	const bounds = convertDrawBounds(helper, element)
	const fontsizeRaw = helper.getUnknown(element.fontsize, 'auto')
	const text = element.text.isExpression
		? helper.getUnknown(element.text, 'ERR')
		: helper.parseVariablesInString(element.text.value, 'ERR')
	const color = helper.getNumber(element.color, 0)
	const halign = helper.getHorizontalAlignment(element.halign)
	const valign = helper.getVerticalAlignment(element.valign)
	const outlineColor = helper.getNumber(element.outlineColor, 0)

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

function convertBoxElementForDrawing(
	helper: ExpressionHelper,
	element: ButtonGraphicsBoxElement
): ButtonGraphicsBoxDrawElement | null {
	// Perform enabled check first, to avoid executing expressions when not needed
	const enabled = helper.getBoolean(element.enabled, true)
	if (!enabled && helper.onlyEnabled) return null

	const opacity = helper.getNumber(element.opacity, 1, 0.01)
	const bounds = convertDrawBounds(helper, element)
	const color = helper.getNumber(element.color, 0)
	const borderProps = convertBorderProperties(helper, element)

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

function convertLineElementForDrawing(
	helper: ExpressionHelper,
	element: ButtonGraphicsLineElement
): ButtonGraphicsLineDrawElement | null {
	// Perform enabled check first, to avoid executing expressions when not needed
	const enabled = helper.getBoolean(element.enabled, true)
	if (!enabled && helper.onlyEnabled) return null

	const opacity = helper.getNumber(element.opacity, 1, 0.01)
	const fromX = helper.getNumber(element.fromX, 0)
	const fromY = helper.getNumber(element.fromY, 0)
	const toX = helper.getNumber(element.toX, 100)
	const toY = helper.getNumber(element.toY, 100)
	const borderProps = convertBorderProperties(helper, element)

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

function convertDrawBounds(
	helper: ExpressionHelper,
	element: MakeExpressionable<ButtonGraphicsDrawBounds & { type: string }>
): ButtonGraphicsDrawBounds {
	return {
		x: helper.getNumber(element.x, 0, 0.01),
		y: helper.getNumber(element.y, 0, 0.01),
		width: helper.getNumber(element.width, 1, 0.01),
		height: helper.getNumber(element.height, 1, 0.01),
	}
}

function convertBorderProperties(
	helper: ExpressionHelper,
	element: MakeExpressionable<ButtonGraphicsBorderProperties & { type: string }>
): ButtonGraphicsBorderProperties {
	return {
		borderWidth: helper.getNumber(element.borderWidth, 0, 0.01),
		borderColor: helper.getNumber(element.borderColor, 0),
		borderPosition: helper.getEnum(element.borderPosition, ['inside', 'center', 'outside'], 'inside'),
	}
}
