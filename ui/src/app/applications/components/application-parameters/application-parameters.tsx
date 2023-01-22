import {AutocompleteField, DataLoader, FormField, FormSelect, getNestedField} from 'argo-ui';
import * as React from 'react';
import {FieldApi, FormApi, FormField as ReactFormField, Text, TextArea} from 'react-form';

import {
    ArrayInputField,
    ArrayValueField,
    CheckboxField,
    EditablePanel,
    EditablePanelItem,
    Expandable,
    MapValueField,
    NameValueEditor,
    StringValueField,
    NameValue,
    // MapInputField,
    TagsInputField,
    ValueEditor
} from '../../../shared/components';
import * as models from '../../../shared/models';
import {ApplicationSourceDirectory, AuthSettings} from '../../../shared/models';
import {services} from '../../../shared/services';
import {ImageTagFieldEditor} from './kustomize';
import * as kustomize from './kustomize-image';
import {VarsInputField} from './vars-input-field';
import {concatMaps} from '../../../shared/utils';
// import {Input} from 'argo-ui/v2';

const TextWithMetadataField = ReactFormField((props: {metadata: {value: string}; fieldApi: FieldApi; className: string}) => {
    const {
        fieldApi: {getValue, setValue}
    } = props;
    const metadata = getValue() || props.metadata;

    return <input className={props.className} value={metadata.value} onChange={el => setValue({...metadata, value: el.target.value})} />;
});

function distinct<T>(first: IterableIterator<T>, second: IterableIterator<T>) {
    return Array.from(new Set(Array.from(first).concat(Array.from(second))));
}

function overridesFirst(first: {overrideIndex: number; metadata: {name: string}}, second: {overrideIndex: number; metadata: {name: string}}) {
    if (first.overrideIndex === second.overrideIndex) {
        return first.metadata.name.localeCompare(second.metadata.name);
    }
    if (first.overrideIndex < 0) {
        return 1;
    } else if (second.overrideIndex < 0) {
        return -1;
    }
    return first.overrideIndex - second.overrideIndex;
}

function getParamsEditableItems(
    app: models.Application,
    title: string,
    fieldsPath: string,
    removedOverrides: boolean[],
    setRemovedOverrides: React.Dispatch<boolean[]>,
    params: {
        key?: string;
        overrideIndex: number;
        original: string;
        metadata: {name: string; value: string};
    }[],
    component: React.ComponentType = TextWithMetadataField
) {
    return params
        .sort(overridesFirst)
        .map((param, i) => ({
            key: param.key,
            title: param.metadata.name,
            view: (
                <span title={param.metadata.value}>
                    {param.overrideIndex > -1 && <span className='fa fa-gavel' title={`Original value: ${param.original}`} />} {param.metadata.value}
                </span>
            ),
            edit: (formApi: FormApi) => {
                const labelStyle = {position: 'absolute', right: 0, top: 0, zIndex: 11} as any;
                const overrideRemoved = removedOverrides[i];
                const fieldItemPath = `${fieldsPath}[${i}]`;
                return (
                    <React.Fragment>
                        {(overrideRemoved && <span>{param.original}</span>) || (
                            <FormField
                                formApi={formApi}
                                field={fieldItemPath}
                                component={component}
                                componentProps={{
                                    metadata: param.metadata
                                }}
                            />
                        )}
                        {param.metadata.value !== param.original && !overrideRemoved && (
                            <a
                                onClick={() => {
                                    formApi.setValue(fieldItemPath, null);
                                    removedOverrides[i] = true;
                                    setRemovedOverrides(removedOverrides);
                                }}
                                style={labelStyle}>
                                Remove override
                            </a>
                        )}
                        {overrideRemoved && (
                            <a
                                onClick={() => {
                                    formApi.setValue(fieldItemPath, getNestedField(app, fieldsPath)[i]);
                                    removedOverrides[i] = false;
                                    setRemovedOverrides(removedOverrides);
                                }}
                                style={labelStyle}>
                                Keep override
                            </a>
                        )}
                    </React.Fragment>
                );
            }
        }))
        .map((item, i) => ({...item, before: (i === 0 && <p style={{marginTop: '1em'}}>{title}</p>) || null}));
}

export const ApplicationParameters = (props: {
    application: models.Application;
    details: models.RepoAppDetails;
    save?: (application: models.Application, query: {validate?: boolean}) => Promise<any>;
    noReadonlyMode?: boolean;
}) => {
    const app = props.application;
    const source = props.application.spec.source;
    const [removedOverrides, setRemovedOverrides] = React.useState(new Array<boolean>());

    let attributes: EditablePanelItem[] = [];

    if (props.details.type === 'Kustomize' && props.details.kustomize) {
        attributes.push({
            title: 'VERSION',
            view: (app.spec.source.kustomize && app.spec.source.kustomize.version) || <span>default</span>,
            edit: (formApi: FormApi) => (
                <DataLoader load={() => services.authService.settings()}>
                    {settings =>
                        ((settings.kustomizeVersions || []).length > 0 && (
                            <FormField formApi={formApi} field='spec.source.kustomize.version' component={AutocompleteField} componentProps={{items: settings.kustomizeVersions}} />
                        )) || <span>default</span>
                    }
                </DataLoader>
            )
        });

        attributes.push({
            title: 'NAME PREFIX',
            view: app.spec.source.kustomize && app.spec.source.kustomize.namePrefix,
            edit: (formApi: FormApi) => <FormField formApi={formApi} field='spec.source.kustomize.namePrefix' component={Text} />
        });

        attributes.push({
            title: 'NAME SUFFIX',
            view: app.spec.source.kustomize && app.spec.source.kustomize.nameSuffix,
            edit: (formApi: FormApi) => <FormField formApi={formApi} field='spec.source.kustomize.nameSuffix' component={Text} />
        });

        const srcImages = ((props.details && props.details.kustomize && props.details.kustomize.images) || []).map(val => kustomize.parse(val));
        const images = ((source.kustomize && source.kustomize.images) || []).map(val => kustomize.parse(val));

        if (srcImages.length > 0) {
            const imagesByName = new Map<string, kustomize.Image>();
            srcImages.forEach(img => imagesByName.set(img.name, img));

            const overridesByName = new Map<string, number>();
            images.forEach((override, i) => overridesByName.set(override.name, i));

            attributes = attributes.concat(
                getParamsEditableItems(
                    app,
                    'IMAGES',
                    'spec.source.kustomize.images',
                    removedOverrides,
                    setRemovedOverrides,
                    distinct(imagesByName.keys(), overridesByName.keys()).map(name => {
                        const param = imagesByName.get(name);
                        const original = param && kustomize.format(param);
                        let overrideIndex = overridesByName.get(name);
                        if (overrideIndex === undefined) {
                            overrideIndex = -1;
                        }
                        const value = (overrideIndex > -1 && kustomize.format(images[overrideIndex])) || original;
                        return {overrideIndex, original, metadata: {name, value}};
                    }),
                    ImageTagFieldEditor
                )
            );
        }
    } else if (props.details.type === 'Helm' && props.details.helm) {
        attributes.push({
            title: 'VALUES FILES',
            view: (app.spec.source.helm && (app.spec.source.helm.valueFiles || []).join(', ')) || 'No values files selected',
            edit: (formApi: FormApi) => (
                <FormField
                    formApi={formApi}
                    field='spec.source.helm.valueFiles'
                    component={TagsInputField}
                    componentProps={{
                        options: props.details.helm.valueFiles,
                        noTagsLabel: 'No values files selected'
                    }}
                />
            )
        });
        if (app?.spec?.source?.helm?.values) {
            attributes.push({
                title: 'VALUES',
                view: app.spec.source.helm && (
                    <Expandable>
                        <pre>{app.spec.source.helm.values}</pre>
                    </Expandable>
                ),
                edit: (formApi: FormApi) => (
                    <div>
                        <pre>
                            <FormField formApi={formApi} field='spec.source.helm.values' component={TextArea} />
                        </pre>
                        {props.details.helm.values && (
                            <div>
                                <label>values.yaml</label>
                                <Expandable>
                                    <pre>{props.details.helm.values}</pre>
                                </Expandable>
                            </div>
                        )}
                    </div>
                )
            });
        }
        const paramsByName = new Map<string, models.HelmParameter>();
        (props.details.helm.parameters || []).forEach(param => paramsByName.set(param.name, param));
        const overridesByName = new Map<string, number>();
        ((source.helm && source.helm.parameters) || []).forEach((override, i) => overridesByName.set(override.name, i));
        attributes = attributes.concat(
            getParamsEditableItems(
                app,
                'PARAMETERS',
                'spec.source.helm.parameters',
                removedOverrides,
                setRemovedOverrides,
                distinct(paramsByName.keys(), overridesByName.keys()).map(name => {
                    const param = paramsByName.get(name);
                    const original = (param && param.value) || '';
                    let overrideIndex = overridesByName.get(name);
                    if (overrideIndex === undefined) {
                        overrideIndex = -1;
                    }
                    const value = (overrideIndex > -1 && source.helm.parameters[overrideIndex].value) || original;
                    return {overrideIndex, original, metadata: {name, value}};
                })
            )
        );
        const fileParamsByName = new Map<string, models.HelmFileParameter>();
        (props.details.helm.fileParameters || []).forEach(param => fileParamsByName.set(param.name, param));
        const fileOverridesByName = new Map<string, number>();
        ((source.helm && source.helm.fileParameters) || []).forEach((override, i) => fileOverridesByName.set(override.name, i));
        attributes = attributes.concat(
            getParamsEditableItems(
                app,
                'PARAMETERS',
                'spec.source.helm.parameters',
                removedOverrides,
                setRemovedOverrides,
                distinct(fileParamsByName.keys(), fileOverridesByName.keys()).map(name => {
                    const param = fileParamsByName.get(name);
                    const original = (param && param.path) || '';
                    let overrideIndex = fileOverridesByName.get(name);
                    if (overrideIndex === undefined) {
                        overrideIndex = -1;
                    }
                    const value = (overrideIndex > -1 && source.helm.fileParameters[overrideIndex].path) || original;
                    return {overrideIndex, original, metadata: {name, value}};
                })
            )
        );
    } else if (props.details.type === 'Plugin') {
        attributes.push({
            title: 'NAME',
            view: <div style={{marginTop: 15}}>{ValueEditor(app.spec.source.plugin && app.spec.source.plugin.name, () => {})}</div>,
            edit: (formApi: FormApi) => (
                <DataLoader load={() => services.authService.settings()}>
                    {(settings: AuthSettings) => (
                        <FormField formApi={formApi} field='spec.source.plugin.name' component={FormSelect} componentProps={{options: (settings.plugins || []).map(p => p.name)}} />
                    )}
                </DataLoader>
            )
        });
        attributes.push({
            title: 'ENV',
            // view: app.spec.source.plugin && (app.spec.source.plugin.env || []).map(i => `${i.name}='${i.value}'`).join(' '),
            view: (
                <div style={{marginTop: 15}}>
                    {app.spec.source.plugin &&
                        (app.spec.source.plugin.env || []).map(val => (
                            <span key={val.name} style={{display: 'block', marginBottom: 5}}>
                                {NameValueEditor(val, () => {})}
                            </span>
                        ))}
                </div>
            ),
            edit: (formApi: FormApi) => <FormField field='spec.source.plugin.env' formApi={formApi} component={ArrayInputField} />
        });
        if (props.details.plugin.parametersAnnouncement) {
            let parametersSet = new Set<string>();
            let pluginSet = new Set<string>();
            for (const announcement of props.details.plugin.parametersAnnouncement) {
                parametersSet.add(announcement.name);
                pluginSet.add(announcement.name);
            }
            if (app.spec.source.plugin?.parameters) {
                for (const appParameter of app.spec.source.plugin.parameters) {
                    parametersSet.add(appParameter.name);
                }
            }

            parametersSet.forEach((name, dupName, parametersSet) => {
                const announcement = props.details.plugin.parametersAnnouncement?.find(param => param.name === name);
                const liveParam = app.spec.source.plugin.parameters?.find(param => param.name === name);

                // console.log('app.spec.source.plugin.parameters', app.spec.source.plugin.parameters);
                // console.log('props.details.plugin.parametersAnnouncement.', props.details.plugin.parametersAnnouncement);

                // console.log('liveParam is', liveParam);
                const pluginIcon = 'This parameter is provided by the plugin. You can override the value.';
                if ((announcement?.collectionType === undefined && liveParam?.array) || announcement?.collectionType === 'array') {
                    let liveParamArray;
                    if (liveParam) {
                        if (liveParam.array) liveParamArray = liveParam.array;
                        else liveParamArray = new Array<string>();
                    }
                    attributes.push({
                        customTitle: (
                            <span>
                                {pluginSet.has(name) && <i className='fa-solid fa-puzzle-piece' title={pluginIcon} style={{marginRight: 5}}></i>}
                                {announcement?.title ?? announcement?.name ?? name}
                            </span>
                        ),
                        // view: (liveParam?.array || announcement?.array || []).join(',  '),
                        view: (
                            <div style={{marginTop: 15}}>
                                {(liveParamArray ?? announcement?.array ?? []).length === 0 && <span>No items</span>}
                                {(liveParamArray ?? announcement?.array ?? []).map((val, index) => (
                                    <span key={index} style={{display: 'block', marginBottom: 5}}>
                                        {ValueEditor(val, () => {})}
                                    </span>
                                ))}
                            </div>
                        ),
                        edit: (formApi: FormApi) => (
                            <FormField
                                field='spec.source.plugin.parameters'
                                componentProps={{name: announcement?.title ?? announcement?.name ?? name, defaultVal: announcement?.array, isPluginPar: pluginSet.has(name)}}
                                formApi={formApi}
                                component={ArrayValueField}
                            />
                        )
                    });
                } else if ((announcement?.collectionType === undefined && liveParam?.map) || announcement?.collectionType === 'map') {
                    let liveParamMap;
                    if (liveParam) {
                        if (liveParam.map) liveParamMap = liveParam.map;
                        else liveParamMap = new Map<string, string>();
                    }
                    const map = concatMaps(liveParamMap ?? announcement?.map, new Map<string, string>());
                    const entries = map.entries();
                    const items = new Array<NameValue>();
                    Array.from(entries).forEach(([key, value]) => items.push({name: key, value: value}));
                    attributes.push({
                        customTitle: (
                            <span>
                                {pluginSet.has(name) && <i className='fa solid fa-puzzle-piece' title={pluginIcon} style={{marginRight: 5}}></i>}
                                {announcement?.title ?? announcement?.name ?? name}
                            </span>
                        ),
                        // view: Array.from(entries)
                        //     .map(([key, value]) => `${key} : '${value}'`)
                        //     .join(','),
                        view: (
                            <div style={{marginTop: 15}}>
                                {items.length == 0 && <span>No items</span>}
                                {items.map(val => (
                                    <span key={val.name} style={{display: 'block', marginBottom: 5}}>
                                        {NameValueEditor(val, () => {})}
                                    </span>
                                ))}
                            </div>
                        ),
                        edit: (formApi: FormApi) => (
                            <FormField
                                field='spec.source.plugin.parameters'
                                componentProps={{name: announcement?.title ?? announcement?.name ?? name, defaultVal: announcement?.map, isPluginPar: pluginSet.has(name)}}
                                formApi={formApi}
                                component={MapValueField}
                            />
                        )
                    });
                } else if (
                    (announcement?.collectionType === undefined && liveParam?.string) ||
                    announcement?.collectionType === '' ||
                    announcement?.collectionType === 'string' ||
                    announcement?.collectionType === undefined
                ) {
                    let liveParamString;
                    if (liveParam) {
                        if (liveParam.string) liveParamString = liveParam.string;
                        else liveParamString = '';
                    }
                    attributes.push({
                        customTitle: (
                            <span>
                                {pluginSet.has(name) && <i className='fa-solid fa-puzzle-piece' title={pluginIcon} style={{marginRight: 5}}></i>}
                                {announcement?.title ?? announcement?.name ?? name}
                            </span>
                        ),
                        view: <div style={{marginTop: 15}}>{ValueEditor(liveParamString ?? announcement?.string, () => {})}</div>,
                        edit: (formApi: FormApi) => (
                            <FormField
                                field='spec.source.plugin.parameters'
                                componentProps={{name: announcement?.title ?? announcement?.name ?? name, defaultVal: announcement?.string, isPluginPar: pluginSet.has(name)}}
                                formApi={formApi}
                                component={StringValueField}
                            />
                        )
                    });
                }
            });
        }
    } else if (props.details.type === 'Directory') {
        const directory = app.spec.source.directory || ({} as ApplicationSourceDirectory);
        attributes.push({
            title: 'DIRECTORY RECURSE',
            view: (!!directory.recurse).toString(),
            edit: (formApi: FormApi) => <FormField formApi={formApi} field='spec.source.directory.recurse' component={CheckboxField} />
        });
        attributes.push({
            title: 'TOP-LEVEL ARGUMENTS',
            view: ((directory.jsonnet && directory.jsonnet.tlas) || []).map((i, j) => (
                <label key={j}>
                    {i.name}='{i.value}' {i.code && 'code'}
                </label>
            )),
            edit: (formApi: FormApi) => <FormField field='spec.source.directory.jsonnet.tlas' formApi={formApi} component={VarsInputField} />
        });
        attributes.push({
            title: 'EXTERNAL VARIABLES',
            view: ((directory.jsonnet && directory.jsonnet.extVars) || []).map((i, j) => (
                <label key={j}>
                    {i.name}='{i.value}' {i.code && 'code'}
                </label>
            )),
            edit: (formApi: FormApi) => <FormField field='spec.source.directory.jsonnet.extVars' formApi={formApi} component={VarsInputField} />
        });

        attributes.push({
            title: 'INCLUDE',
            view: app.spec.source.directory && app.spec.source.directory.include,
            edit: (formApi: FormApi) => <FormField formApi={formApi} field='spec.source.directory.include' component={Text} />
        });

        attributes.push({
            title: 'EXCLUDE',
            view: app.spec.source.directory && app.spec.source.directory.exclude,
            edit: (formApi: FormApi) => <FormField formApi={formApi} field='spec.source.directory.exclude' component={Text} />
        });
    }

    return (
        <EditablePanel
            save={
                props.save &&
                (async (input: models.Application) => {
                    function isDefined(item: any) {
                        return item !== null && item !== undefined;
                    }
                    function isDefinedWithVersion(item: any) {
                        return item !== null && item !== undefined && item.match(/:/);
                    }

                    if (input.spec.source.helm && input.spec.source.helm.parameters) {
                        input.spec.source.helm.parameters = input.spec.source.helm.parameters.filter(isDefined);
                    }
                    if (input.spec.source.kustomize && input.spec.source.kustomize.images) {
                        input.spec.source.kustomize.images = input.spec.source.kustomize.images.filter(isDefinedWithVersion);
                    }
                    await props.save(input, {});
                    setRemovedOverrides(new Array<boolean>());
                })
            }
            values={app}
            validate={updatedApp => {
                const errors = {} as any;

                for (const fieldPath of ['spec.source.directory.jsonnet.tlas', 'spec.source.directory.jsonnet.extVars']) {
                    const invalid = ((getNestedField(updatedApp, fieldPath) || []) as Array<models.JsonnetVar>).filter(item => !item.name && !item.code);
                    errors[fieldPath] = invalid.length > 0 ? 'All fields must have name' : null;
                }

                return errors;
            }}
            title={props.details.type.toLocaleUpperCase()}
            items={attributes}
            noReadonlyMode={props.noReadonlyMode}
        />
    );
};
