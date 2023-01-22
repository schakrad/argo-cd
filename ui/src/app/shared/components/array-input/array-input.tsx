import * as React from 'react';
import * as ReactForm from 'react-form';
// import {concatMaps} from '../../utils';

/*
    This provide a way to may a form field to an array of items. It allows you to

    * Add a new (maybe duplicate) item.
    * Replace an item.
    * Remove an item.

    E.g.
    env:
    - name: FOO
      value: bar
    - name: BAZ
      value: qux
    # You can have dup items
    - name: FOO
      value: bar

    It does not allow re-ordering of elements (maybe in a v2).
 */

export interface NameValue {
    name: string;
    value: string;
}

export const NameValueEditor = (item: NameValue, onChange: (item: NameValue) => any) => (
    <React.Fragment>
        <input
            // disable chrome autocomplete
            autoComplete='fake'
            className='argo-field'
            style={{width: '40%'}}
            placeholder='Name'
            value={item.name || ''}
            onChange={e => onChange({...item, name: e.target.value})}
            title='Name'
        />
        &nbsp; = &nbsp;
        <input
            // disable chrome autocomplete
            autoComplete='fake'
            className='argo-field'
            style={{width: '40%'}}
            placeholder='Value'
            value={item.value || ''}
            onChange={e => onChange({...item, value: e.target.value})}
            title='Value'
        />
        &nbsp;
    </React.Fragment>
);

export const ValueEditor = (item: string, onChange: (item: string) => any) => {
    return (
        <input
            // disable chrome autocomplete
            autoComplete='fake'
            className='argo-field'
            style={{width: '40%'}}
            placeholder='Value'
            value={item || ''}
            onChange={e => onChange(e.target.value)}
            title='Value'
        />
    );
};

interface Props<T> {
    items: T[];
    onChange: (items: T[]) => void;
    editor: (item: T, onChange: (updated: T) => any) => React.ReactNode;
}

export function ArrayInput<T>(props: Props<T>) {
    const addItem = (item: T) => {
        props.onChange([...props.items, item]);
    };

    const replaceItem = (item: T, i: number) => {
        const items = props.items.slice();
        items[i] = item;
        props.onChange(items);
    };

    const removeItem = (i: number) => {
        const items = props.items.slice();
        items.splice(i, 1);
        console.log('items in remove are', items);
        props.onChange(items);
    };

    // console.log('items in array input', props.items);
    return (
        <div className='argo-field' style={{border: 0, marginTop: '15px', zIndex: 1}}>
            {props.items.map((item, i) => (
                <div key={`item-${i}`} style={{marginBottom: '5px'}}>
                    {props.editor(item, (updated: T) => replaceItem(updated, i))}
                    &nbsp;
                    <button>
                        <i className='fa fa-times' style={{cursor: 'pointer'}} onClick={() => removeItem(i)} />
                    </button>{' '}
                </div>
            ))}
            {props.items.length === 0 && <label>No items</label>}
            <div>
                <button className='argo-button argo-button--base argo-button--short' onClick={() => addItem({} as T)}>
                    <i style={{cursor: 'pointer'}} className='fa fa-plus' />
                </button>
            </div>
        </div>
    );
}

export const ArrayInputField = ReactForm.FormField((props: {fieldApi: ReactForm.FieldApi}) => {
    const {
        fieldApi: {getValue, setValue}
    } = props;
    return <ArrayInput editor={NameValueEditor} items={getValue() || []} onChange={setValue} />;
});

export const ArrayValueField = ReactForm.FormField((props: {fieldApi: ReactForm.FieldApi; name: string; defaultVal: string[]; isPluginPar: boolean}) => {
    const {
        fieldApi: {getValue, setValue}
    } = props;

    let liveParamArray;
    const liveParam = getValue()?.find((val: {name: String; array: Object}) => val.name === props.name);
    if (liveParam) {
        if (liveParam.array) liveParamArray = liveParam.array;
        else liveParamArray = new Array<string>();
    }
    const index = getValue()?.findIndex((val: {name: String; array: Object}) => val.name === props.name) ?? -1;
    let values = liveParamArray ?? props.defaultVal;
    const [disabled, setDisabled] = React.useState(index == -1 && props.isPluginPar);

    const handleChange = () => {
        const index = getValue()?.findIndex((val: {name: string; array: Object}) => val.name === props.name) ?? -1;
        if (index >= 0) {
            getValue().splice(index, 1);
            setValue([...getValue()]);
        }

        setDisabled(true);
    };

    let content = props.isPluginPar ? 'Reset' : 'Delete';
    let tooltip = '';
    if (content === 'Reset' && !disabled) {
        tooltip = 'Resets the parameter to the value provided by the plugin. This removes the parameter override from the application manifest';
    } else if (content === 'Delete' && !disabled) {
        tooltip = 'Deletes this parameter from the application manifest.';
    }
    return (
        <React.Fragment>
            <button
                className='argo-button argo-button--base'
                disabled={disabled}
                title={tooltip}
                style={{fontSize: '12px', display: 'flex', marginLeft: 'auto', marginTop: 8}}
                onClick={handleChange}>
                {content}
            </button>

            <ArrayInput
                editor={ValueEditor}
                items={values || []}
                onChange={change => {
                    const update = change.map((val: string | Object) => (typeof val != 'string' ? '' : val));
                    if (index >= 0) {
                        getValue()[index].array = update;
                        setValue([...getValue()]);
                    } else {
                        setValue([...(getValue() || []), {name: props.name, array: update}]);
                    }
                    setDisabled(false);
                }}
            />
        </React.Fragment>
    );
});

export const StringValueField = ReactForm.FormField((props: {fieldApi: ReactForm.FieldApi; name: string; defaultVal: string; isPluginPar: boolean}) => {
    const {
        fieldApi: {getValue, setValue}
    } = props;
    let liveParamString;
    const liveParam = getValue()?.find((val: {name: String; string: Object}) => val.name === props.name);
    if (liveParam) {
        if (liveParam.string) liveParamString = liveParam.string;
        else liveParamString = '';
    }
    let values = liveParamString?? props.defaultVal;
    const index = getValue()?.findIndex((val: {name: string; string: string}) => val.name === props.name) ?? -1;
    const [disabled, setDisabled] = React.useState(index == -1 && props.isPluginPar);

    const handleChange = () => {
        const index = getValue()?.findIndex((val: {name: string; string: Object}) => val.name === props.name) ?? -1;
        if (index >= 0) {
            getValue().splice(index, 1);
            setValue([...getValue()]);
        }
        setDisabled(true);
    };

    let content = props.isPluginPar ? 'Reset' : 'Delete';

    let tooltip = '';
    if (content === 'Reset' && !disabled) {
        tooltip = 'Resets the parameter to the value provided by the plugin. This removes the parameter override from the application manifest';
    } else if (content === 'Delete' && !disabled) {
        tooltip = 'Deletes this parameter from the application manifest.';
    }
    return (
        <React.Fragment>
            <button
                className='argo-button argo-button--base'
                disabled={disabled}
                title={tooltip}
                style={{fontSize: '12px', display: 'flex', marginLeft: 'auto', marginTop: 8}}
                onClick={handleChange}>
                {content}
            </button>
            <div>
                <input
                    // disable chrome autocomplete
                    autoComplete='fake'
                    className='argo-field'
                    style={{width: '40%', display: 'inline-block', marginTop: 25}}
                    placeholder='Value'
                    value={values || ''}
                    onChange={e => {
                        if (index >= 0) {
                            getValue()[index].string = e.target.value;
                            setValue([...getValue()]);
                        } else {
                            setValue([...(getValue() || []), {name: props.name, string: e.target.value}]);
                        }
                        setDisabled(false);
                    }}
                    title='Value'
                />
            </div>
        </React.Fragment>
    );
});

export const MapValueField = ReactForm.FormField((props: {fieldApi: ReactForm.FieldApi; name: String; defaultVal: Map<string, string>; isPluginPar: boolean}) => {
    const {
        fieldApi: {getValue, setValue}
    } = props;
    const items = new Array<NameValue>();
    let liveParamMap;
    const liveParam = getValue()?.find((val: {name: String; map: Object}) => val.name === props.name);
    if (liveParam) {
        if (liveParam.map) liveParamMap = liveParam.map;
        else liveParamMap = new Map<string, string>();
    }
    const map = liveParamMap ?? props.defaultVal ?? {};
    // console.log('map is ', map);
    Object.keys(map).forEach(item => items.push({name: item, value: map[item]}));
    // console.log('items are ', items);
    const index = getValue()?.findIndex((val: {name: string; map: Object}) => val.name === props.name) ?? -1;
    const [disabled, setDisabled] = React.useState(index == -1 && props.isPluginPar);
    const handleChange = () => {
        const index = getValue()?.findIndex((val: {name: string; map: Object}) => val.name === props.name) ?? -1;
        if (index >= 0) {
            getValue().splice(index, 1);
            setValue([...getValue()]);
        }

        setDisabled(true);
    };

    let content = props.isPluginPar ? 'Reset' : 'Delete';
    let tooltip = '';
    if (content === 'Reset' && !disabled) {
        tooltip = 'Resets the parameter to the value provided by the plugin. This removes the parameter override from the application manifest';
    } else if (content === 'Delete' && !disabled) {
        tooltip = 'Deletes this parameter from the application manifest.';
    }
    return (
        <React.Fragment>
            <button
                className='argo-button argo-button--base'
                disabled={disabled}
                title={tooltip}
                style={{fontSize: '12px', display: 'flex', marginLeft: 'auto', marginTop: 8}}
                onClick={handleChange}>
                {content}
            </button>
            <ArrayInput
                editor={NameValueEditor}
                items={items}
                onChange={array => {
                    console.log('array is ', array);
                    const newMap = {} as any;
                    array.forEach(item => (newMap[item.name || ''] = item.value || ''));
                    const index = getValue()?.findIndex((val: {name: String; map: Object}) => val.name === props.name) ?? -1;
                    if (index >= 0) {
                        getValue()[index].map = newMap;
                        setValue([...getValue()]);
                    } else {
                        setValue([...(getValue() || []), {name: props.name, map: newMap}]);
                    }
                    setDisabled(false);
                    console.log('getValue in onchange map is ', getValue());
                }}
            />
        </React.Fragment>
    );
});

export const MapInputField = ReactForm.FormField((props: {fieldApi: ReactForm.FieldApi}) => {
    const {
        fieldApi: {getValue, setValue}
    } = props;
    const items = new Array<NameValue>();
    const map = getValue() || {};
    Object.keys(map).forEach(key => items.push({name: key, value: map[key]}));
    return (
        <ArrayInput
            editor={NameValueEditor}
            items={items}
            onChange={array => {
                const newMap = {} as any;
                array.forEach(item => (newMap[item.name || ''] = item.value || ''));
                setValue(newMap);
            }}
        />
    );
});
