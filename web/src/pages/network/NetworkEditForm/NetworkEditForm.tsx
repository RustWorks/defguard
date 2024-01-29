import './style.scss';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isNull, omit, omitBy } from 'lodash-es';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';
import { z } from 'zod';
import { shallow } from 'zustand/shallow';

import { useI18nContext } from '../../../i18n/i18n-react';
import { FormCheckBox } from '../../../shared/defguard-ui/components/Form/FormCheckBox/FormCheckBox.tsx';
import { FormInput } from '../../../shared/defguard-ui/components/Form/FormInput/FormInput';
import { FormSelect } from '../../../shared/defguard-ui/components/Form/FormSelect/FormSelect';
import { MessageBox } from '../../../shared/defguard-ui/components/Layout/MessageBox/MessageBox';
import { SelectOption } from '../../../shared/defguard-ui/components/Layout/Select/types';
import useApi from '../../../shared/hooks/useApi';
import { useToaster } from '../../../shared/hooks/useToaster';
import { QueryKeys } from '../../../shared/queries';
import { Network } from '../../../shared/types';
import { titleCase } from '../../../shared/utils/titleCase';
import {
  validateIp,
  validateIpList,
  validateIpOrDomain,
  validateIpOrDomainList,
} from '../../../shared/validators';
import { useNetworkPageStore } from '../hooks/useNetworkPageStore';

type FormFields = {
  address: string;
  endpoint: string;
  port: number;
  allowed_ips: string;
  allowed_groups: string[];
  name: string;
  dns: string;
  mfa_enabled: boolean;
  keepalive_interval: number;
  peer_disconnect_threshold: number;
};

const defaultValues: FormFields = {
  address: '',
  endpoint: '',
  name: '',
  port: 50051,
  allowed_ips: '',
  allowed_groups: [],
  dns: '',
  mfa_enabled: false,
  keepalive_interval: 25,
  peer_disconnect_threshold: 180,
};

const networkToForm = (data?: Network): FormFields => {
  if (!data) return defaultValues;
  let omited = omitBy<Network>(data, isNull);
  omited = omit(omited, ['id', 'connected_at', 'connected', 'allowed_ips', 'gateways']);

  let allowed_ips = '';

  if (Array.isArray(data.allowed_ips)) {
    allowed_ips = data.allowed_ips.join(',');
  }

  return { ...defaultValues, ...omited, allowed_ips };
};

export const NetworkEditForm = () => {
  const toaster = useToaster();
  const {
    network: { editNetwork },
    groups: { getGroups },
  } = useApi();
  const submitRef = useRef<HTMLButtonElement | null>(null);
  const setStoreState = useNetworkPageStore((state) => state.setState);
  const submitSubject = useNetworkPageStore((state) => state.saveSubject);
  const [componentMount, setComponentMount] = useState(false);
  const [groupOptions, setGroupOptions] = useState<SelectOption<string>[]>([]);
  const [selectedNetworkId, networks] = useNetworkPageStore(
    (state) => [state.selectedNetworkId, state.networks],
    shallow,
  );
  const queryClient = useQueryClient();
  const { LL } = useI18nContext();

  const { mutate } = useMutation({
    mutationFn: editNetwork,
    onSuccess: () => {
      setStoreState({ loading: false });
      toaster.success(LL.networkConfiguration.form.messages.networkModified());
      const keys = [
        QueryKeys.FETCH_NETWORK,
        QueryKeys.FETCH_NETWORKS,
        QueryKeys.FETCH_NETWORK_TOKEN,
      ];
      for (const key of keys) {
        queryClient.refetchQueries({
          queryKey: [key],
        });
      }
    },
    onError: (err) => {
      setStoreState({ loading: false });
      console.error(err);
      toaster.error(LL.messages.error());
    },
  });

  const { isError: groupsError, isLoading: groupsLoading } = useQuery({
    queryKey: [QueryKeys.FETCH_GROUPS],
    queryFn: getGroups,
    onSuccess: (res) => {
      setGroupOptions(
        res.groups.map((g) => ({
          key: g,
          value: g,
          label: titleCase(g),
        })),
      );
    },
    onError: (err) => {
      toaster.error(LL.messages.error());
      console.error(err);
    },
    enabled: componentMount,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: 'always',
  });

  const defaultFormValues = useMemo(() => {
    if (selectedNetworkId && networks) {
      const network = networks.find((n) => n.id === selectedNetworkId);
      if (network) {
        const res = networkToForm(network);
        if (res) {
          return res;
        }
      }
    }
    return defaultValues;
  }, [networks, selectedNetworkId]);

  const zodSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(1, LL.form.error.required()),
        address: z
          .string()
          .min(1, LL.form.error.required())
          .refine((value) => {
            const netmaskPresent = value.split('/').length == 2;
            if (!netmaskPresent) {
              return false;
            }
            const ipValid = validateIp(value, true);
            if (ipValid) {
              const host = value.split('.')[3].split('/')[0];
              if (host === '0') return false;
            }
            return ipValid;
          }, LL.form.error.address()),
        endpoint: z
          .string()
          .min(1, LL.form.error.required())
          .refine((val) => validateIpOrDomain(val), LL.form.error.endpoint()),
        port: z.number().max(65535, LL.form.error.portMax()),
        allowed_ips: z
          .string()
          .optional()
          .refine((val) => {
            if (val === '' || !val) {
              return true;
            }
            return validateIpList(val, ',', true);
          }, LL.form.error.allowedIps()),
        dns: z
          .string()
          .optional()
          .refine((val) => {
            if (val === '' || !val) {
              return true;
            }
            return validateIpOrDomainList(val, ',', true);
          }, LL.form.error.allowedIps()),
        mfa_enabled: z.boolean(),
        keepalive_interval: z.number().nonnegative().min(1, LL.form.error.required()),
        peer_disconnect_threshold: z
          .number()
          .nonnegative()
          .minValue(120, LL.form.error.invalid())
          .min(1, LL.form.error.required()),
      }),
    [LL.form.error],
  );

  const { control, handleSubmit, reset } = useForm<FormFields>({
    defaultValues: defaultFormValues,
    resolver: zodResolver(zodSchema),
    mode: 'all',
  });

  const onValidSubmit: SubmitHandler<FormFields> = async (values) => {
    setStoreState({ loading: true });
    mutate({
      id: selectedNetworkId,
      network: {
        ...values,
      },
    });
  };

  // reset form when network is selected
  useEffect(() => {
    reset(defaultFormValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultFormValues, reset]);

  useEffect(() => {
    setTimeout(() => setComponentMount(true), 100);
    const sub = submitSubject.subscribe(() => submitRef.current?.click());
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="network-config">
      <header>
        <h2>{LL.networkConfiguration.header()}</h2>
      </header>
      <form onSubmit={handleSubmit(onValidSubmit)}>
        <FormInput
          controller={{ control, name: 'name' }}
          label={LL.networkConfiguration.form.fields.name.label()}
        />
        <MessageBox>
          <p>{LL.networkConfiguration.form.helpers.address()}</p>
        </MessageBox>
        <FormInput
          controller={{ control, name: 'address' }}
          label={LL.networkConfiguration.form.fields.address.label()}
        />
        <MessageBox>
          <p>{LL.networkConfiguration.form.helpers.gateway()}</p>
        </MessageBox>
        <FormInput
          controller={{ control, name: 'endpoint' }}
          label={LL.networkConfiguration.form.fields.endpoint.label()}
        />
        <FormInput
          controller={{ control, name: 'port' }}
          label={LL.networkConfiguration.form.fields.port.label()}
        />
        <MessageBox>
          <p>{LL.networkConfiguration.form.helpers.allowedIps()}</p>
        </MessageBox>
        <FormInput
          controller={{ control, name: 'allowed_ips' }}
          label={LL.networkConfiguration.form.fields.allowedIps.label()}
        />
        <MessageBox>
          <p>{LL.networkConfiguration.form.helpers.dns()}</p>
        </MessageBox>
        <FormInput
          controller={{ control, name: 'dns' }}
          label={LL.networkConfiguration.form.fields.dns.label()}
        />
        <MessageBox>
          <p>{LL.networkConfiguration.form.helpers.allowedGroups()}</p>
        </MessageBox>
        <FormSelect
          controller={{ control, name: 'allowed_groups' }}
          label={LL.networkConfiguration.form.fields.allowedGroups.label()}
          loading={groupsLoading}
          disabled={groupsError || (!groupsLoading && groupOptions.length === 0)}
          options={groupOptions}
          placeholder={LL.networkConfiguration.form.fields.allowedGroups.placeholder()}
          searchable
          searchFilter={(val, options) => {
            const inf = options as SelectOption<string>[];
            return inf.filter((o) => o.value.toLowerCase().includes(val.toLowerCase()));
          }}
          renderSelected={(val) => ({
            key: val,
            displayValue: titleCase(val),
          })}
        />
        <FormCheckBox
          controller={{ control, name: 'mfa_enabled' }}
          label={LL.networkConfiguration.form.fields.mfa_enabled.label()}
          labelPlacement="right"
        />
        <FormInput
          controller={{ control, name: 'keepalive_interval' }}
          label={LL.networkConfiguration.form.fields.keepalive_interval.label()}
        />
        <FormInput
          controller={{ control, name: 'peer_disconnect_threshold' }}
          label={LL.networkConfiguration.form.fields.peer_disconnect_threshold.label()}
        />
        <button type="submit" className="hidden" ref={submitRef}></button>
      </form>
    </section>
  );
};
