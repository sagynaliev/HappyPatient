import {describe,expect,it} from 'vitest';
import {roleLabel} from './AuthContext';
describe('roleLabel',()=>{it('formats API roles for display',()=>{expect(roleLabel('PATIENT')).toBe('Patient');expect(roleLabel('ADMIN')).toBe('Admin')})});
